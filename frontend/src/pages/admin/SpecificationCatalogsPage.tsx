import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activateSpecificationCatalog,
  getSpecificationCatalog,
  importSpecificationCatalog,
  listSpecificationCatalogs,
} from '@/api/admin';
import { extractApiErrorMessage } from '@/api/client';
import {
  TltAlert,
  TltBadge,
  TltButton,
  TltCard,
  TltEmptyState,
  TltSkeleton,
  TltTable,
  type TltUiTone,
} from '@/components/ui-kit';
import { appMessage, appModal } from '@/feedback/appFeedback';
import type {
  SpecificationCatalogAuthority,
  SpecificationCatalogCategory,
  SpecificationCatalogImportRequest,
  SpecificationCatalogItemInput,
  SpecificationCatalogItemSummary,
  SpecificationCatalogValidationIssue,
  SpecificationCatalogVersion,
} from '@/types/admin';
import './specification-catalogs-page.css';

const catalogQueryKey = ['admin', 'specification-catalogs'] as const;

const authorityValues: readonly SpecificationCatalogAuthority[] = [
  'approved', 'provisional', 'synthetic', 'demo', 'guessed',
];
const categoryValues: readonly SpecificationCatalogCategory[] = [
  'cable', 'connection_kit', 'repair_kit', 'sealant',
  'fiberglass_tape', 'aluminium_tape', 'box',
];

function isCatalogAuthority(value: string): value is SpecificationCatalogAuthority {
  return authorityValues.some((candidate) => candidate === value);
}

function isCatalogCategory(value: string): value is SpecificationCatalogCategory {
  return categoryValues.some((candidate) => candidate === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Поле ${field} должно быть непустой строкой`);
  }
  return value;
}

function optionalRecord(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`Поле ${field} должно быть объектом`);
  return value;
}

function parseCatalogItem(value: unknown, index: number): SpecificationCatalogItemInput {
  if (!isRecord(value)) throw new Error(`items[${index}] должен быть объектом`);
  const category = requiredString(value.category, `items[${index}].category`);
  if (!isCatalogCategory(category)) {
    throw new Error(`Неизвестная категория items[${index}].category: ${category}`);
  }
  return {
    item_key: requiredString(value.item_key, `items[${index}].item_key`),
    category,
    name: requiredString(value.name, `items[${index}].name`),
    mark: requiredString(value.mark, `items[${index}].mark`),
    nomenclature_code: requiredString(
      value.nomenclature_code,
      `items[${index}].nomenclature_code`,
    ),
    supply_unit: requiredString(value.supply_unit, `items[${index}].supply_unit`),
    applicability: optionalRecord(value.applicability, `items[${index}].applicability`),
    package_parameters: optionalRecord(
      value.package_parameters,
      `items[${index}].package_parameters`,
    ),
    formula_parameters: optionalRecord(
      value.formula_parameters,
      `items[${index}].formula_parameters`,
    ),
    source_ref: requiredString(value.source_ref, `items[${index}].source_ref`),
  };
}

function parseImportDocument(source: string): SpecificationCatalogImportRequest {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value)) throw new Error('Документ каталога должен быть JSON-объектом');
  const authority = requiredString(value.authority, 'authority');
  if (!isCatalogAuthority(authority)) {
    throw new Error(`Неизвестный authority: ${authority}`);
  }
  if (!Number.isInteger(value.schema_version) || Number(value.schema_version) < 1) {
    throw new Error('Поле schema_version должно быть положительным целым числом');
  }
  if (!Array.isArray(value.items) || value.items.length === 0) {
    throw new Error('Поле items должно быть непустым массивом');
  }
  return {
    catalog_key: requiredString(value.catalog_key, 'catalog_key'),
    version: requiredString(value.version, 'version'),
    authority,
    source: requiredString(value.source, 'source'),
    source_checksum: requiredString(value.source_checksum, 'source_checksum'),
    schema_version: Number(value.schema_version),
    items: value.items.map(parseCatalogItem),
  };
}

function statusTone(status: SpecificationCatalogVersion['status']): TltUiTone {
  if (status === 'active') return 'success';
  if (status === 'retired') return 'neutral';
  return 'info';
}

function activationBlockReason(catalog: SpecificationCatalogVersion): string | null {
  if (catalog.status !== 'draft') return 'Активировать можно только draft-версию.';
  if (catalog.authority !== 'approved') return 'Authority каталога должен быть approved.';
  if (!catalog.is_complete) return 'Каталог неполный: устраните validation issues.';
  return null;
}

function IssueList({ issues }: { issues: SpecificationCatalogValidationIssue[] }) {
  if (issues.length === 0) {
    return <TltAlert tone="success" title="Проверка пройдена">Validation issues отсутствуют.</TltAlert>;
  }
  return (
    <TltAlert tone="warning" title={`Validation issues: ${issues.length}`}>
      <ul className="spec-catalog-admin__issues">
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${issue.item_key ?? issue.category ?? index}`}>
            <strong>{issue.code}</strong>
            <span>{issue.reason}</span>
            {issue.category ? <span>category: {issue.category}</span> : null}
            {issue.item_key ? <span>item: {issue.item_key}</span> : null}
            {issue.details ? <code>{JSON.stringify(issue.details)}</code> : null}
          </li>
        ))}
      </ul>
    </TltAlert>
  );
}

export default function SpecificationCatalogsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importSource, setImportSource] = useState('');
  const [importParseError, setImportParseError] = useState<string | null>(null);

  const catalogsQuery = useQuery({ queryKey: catalogQueryKey, queryFn: () => listSpecificationCatalogs() });
  const catalogs = useMemo(() => catalogsQuery.data ?? [], [catalogsQuery.data]);

  useEffect(() => {
    if (catalogs.length === 0) {
      setSelectedId(null);
    } else if (!selectedId) {
      setSelectedId(catalogs[0].id);
    }
  }, [catalogs, selectedId]);

  const detailQuery = useQuery({
    queryKey: [...catalogQueryKey, selectedId],
    queryFn: () => {
      if (!selectedId) throw new Error('Версия каталога не выбрана');
      return getSpecificationCatalog(selectedId);
    },
    enabled: selectedId !== null,
  });

  const importMutation = useMutation({
    mutationFn: importSpecificationCatalog,
    onSuccess: async (catalog) => {
      setImportSource('');
      setImportParseError(null);
      setSelectedId(catalog.id);
      await queryClient.invalidateQueries({ queryKey: catalogQueryKey });
      appMessage.success(`Draft ${catalog.version} импортирован`);
    },
    onError: (error) => appMessage.error(extractApiErrorMessage(error, 'Не удалось импортировать каталог')),
  });

  const activateMutation = useMutation({
    mutationFn: activateSpecificationCatalog,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: catalogQueryKey });
      appMessage.success(
        `Каталог активирован. Устаревших спецификаций: ${result.stale_specification_count}`,
      );
    },
    onError: (error) => appMessage.error(extractApiErrorMessage(error, 'Не удалось активировать каталог')),
  });

  const submitImport = () => {
    try {
      const document = parseImportDocument(importSource);
      setImportParseError(null);
      importMutation.mutate(document);
    } catch (error) {
      setImportParseError(extractApiErrorMessage(error, 'Некорректный JSON документа'));
    }
  };

  const requestActivation = (catalog: SpecificationCatalogVersion) => {
    appModal.confirm({
      title: `Активировать каталог ${catalog.version}?`,
      content: 'Текущая active-версия будет переведена в retired, а связанные спецификации станут устаревшими.',
      okText: 'Активировать',
      cancelText: 'Отмена',
      onOk: () => activateMutation.mutateAsync(catalog.id),
    });
  };

  const detail = detailQuery.data;
  const blockReason = detail ? activationBlockReason(detail) : null;

  return (
    <main className="spec-catalog-admin">
      <header className="spec-catalog-admin__header">
        <div>
          <h1>Каталоги спецификации</h1>
          <p>Импорт immutable draft, проверка полноты и активация approved-версии.</p>
        </div>
        <TltButton onClick={() => catalogsQuery.refetch()} loading={catalogsQuery.isFetching}>
          Обновить
        </TltButton>
      </header>

      <TltCard title="Импорт draft" description="Вставьте полный JSON-документ канонического каталога.">
        <label className="spec-catalog-admin__import-label" htmlFor="spec-catalog-import-json">
          JSON документа каталога
        </label>
        <textarea
          id="spec-catalog-import-json"
          className="spec-catalog-admin__textarea"
          rows={8}
          spellCheck={false}
          value={importSource}
          onChange={(event) => setImportSource(event.target.value)}
          aria-invalid={Boolean(importParseError)}
          aria-describedby={importParseError ? 'spec-catalog-import-error' : undefined}
        />
        {importParseError ? (
          <TltAlert id="spec-catalog-import-error" tone="danger" title="Документ не принят">
            {importParseError}
          </TltAlert>
        ) : null}
        {importMutation.isError ? (
          <TltAlert tone="danger" title="Ошибка импорта">
            {extractApiErrorMessage(importMutation.error)}
          </TltAlert>
        ) : null}
        <TltButton
          variant="primary"
          disabled={importSource.trim() === ''}
          loading={importMutation.isPending}
          onClick={submitImport}
        >
          Импортировать draft
        </TltButton>
      </TltCard>

      <TltCard title="Версии каталога">
        {catalogsQuery.isPending ? <TltSkeleton variant="panel" label="Загрузка версий каталога" /> : null}
        {catalogsQuery.isError ? (
          <TltAlert
            tone="danger"
            title="Не удалось загрузить каталоги"
            action={<TltButton onClick={() => catalogsQuery.refetch()}>Повторить</TltButton>}
          >
            {extractApiErrorMessage(catalogsQuery.error)}
          </TltAlert>
        ) : null}
        {catalogsQuery.isSuccess && catalogs.length === 0 ? (
          <TltEmptyState title="Каталоги ещё не импортированы" description="Импортируйте первый immutable draft выше." />
        ) : null}
        {catalogs.length > 0 ? (
          <TltTable
            aria-label="Версии каталога спецификации"
            rows={catalogs}
            rowKey="id"
            selectedRowKey={selectedId}
            onRowSelect={(catalog) => setSelectedId(catalog.id)}
            columns={[
              { key: 'version', header: 'Версия' },
              { key: 'status', header: 'Статус', render: (catalog) => <TltBadge tone={statusTone(catalog.status)}>{catalog.status}</TltBadge> },
              { key: 'authority', header: 'Authority' },
              { key: 'item_count', header: 'Строк' },
              { key: 'is_complete', header: 'Полнота', render: (catalog) => catalog.is_complete ? 'полный' : 'неполный' },
              { key: 'payload_checksum', header: 'Payload checksum' },
            ]}
          />
        ) : null}
      </TltCard>

      {selectedId ? (
        <TltCard title="Детали выбранной версии">
          {detailQuery.isPending ? <TltSkeleton variant="panel" label="Загрузка деталей каталога" /> : null}
          {detailQuery.isError ? (
            <TltAlert
              tone="danger"
              title="Не удалось загрузить детали"
              action={<TltButton onClick={() => detailQuery.refetch()}>Повторить</TltButton>}
            >
              {extractApiErrorMessage(detailQuery.error)}
            </TltAlert>
          ) : null}
          {detail ? (
            <div className="spec-catalog-admin__detail">
              <dl className="spec-catalog-admin__metadata">
                <dt>Ключ</dt><dd>{detail.catalog_key}</dd>
                <dt>Версия</dt><dd>{detail.version}</dd>
                <dt>Источник</dt><dd>{detail.source}</dd>
                <dt>Source checksum</dt><dd><code>{detail.source_checksum}</code></dd>
                <dt>Payload checksum</dt><dd><code>{detail.payload_checksum}</code></dd>
                <dt>Schema</dt><dd>{detail.schema_version}</dd>
              </dl>
              <IssueList issues={detail.validation_issues} />
              <div className="spec-catalog-admin__activation">
                <TltButton
                  variant="primary"
                  disabled={Boolean(blockReason)}
                  loading={activateMutation.isPending}
                  onClick={() => requestActivation(detail)}
                >
                  Активировать версию
                </TltButton>
                {blockReason ? <span>{blockReason}</span> : null}
              </div>
              <TltTable<SpecificationCatalogItemSummary>
                aria-label="Строки выбранной версии каталога"
                caption={`Строки каталога: ${detail.items.length}`}
                rows={detail.items}
                rowKey="id"
                columns={[
                  { key: 'position', header: '№' },
                  { key: 'category', header: 'Категория' },
                  { key: 'mark', header: 'Марка' },
                  { key: 'nomenclature_code', header: 'Код' },
                  { key: 'supply_unit', header: 'Ед.' },
                  { key: 'source_ref', header: 'Источник' },
                ]}
              />
            </div>
          ) : null}
        </TltCard>
      ) : null}
    </main>
  );
}
