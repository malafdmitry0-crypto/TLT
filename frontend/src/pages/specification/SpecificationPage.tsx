import {
  Alert,
  Button,
  Card,
  Skeleton,
  Space,
  Tabs,
  Typography,
} from 'antd';
import {
  DownloadOutlined,
  ReloadOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import SpecTable from '@/components/specification/SpecTable';
import QueryError from '@/components/common/QueryError';
import EmptyProjectState from '@/components/common/EmptyProjectState';
import { ROUTES } from '@/routes/routes';
import { useSpecificationPageModel } from '@/pages/specification/useSpecificationPageModel';
import { SpecPageChrome } from '@/pages/specification/SpecPageChrome';

const { Text } = Typography;

export default function SpecificationPage() {
  const m = useSpecificationPageModel();
  const {
    project,
    canMutateProject,
    canManuallyEdit,
    isEmployee,
    variantContext,
    selectedElectricalVariant,
    settingsOpen,
    toggleSettings,
    groupBy,
    setGroupBy,
    mergeIdentical,
    setMergeIdentical,
    addOpen,
    setAddOpen,
    selectedAccessoryId,
    setSelectedAccessoryId,
    qty,
    setQty,
    selectedGenerateErIds,
    setSelectedGenerateErIds,
    preflightOpen,
    setPreflightOpen,
    preflightSummary,
    setPendingGenerate,
    exZone,
    setExZone,
    reserveCoeff,
    setReserveCoeff,
    indicationOnBoxes,
    setIndicationOnBoxes,
    endSectionIndication,
    setEndSectionIndication,
    topIndication,
    setTopIndication,
    minLengthK2i,
    setMinLengthK2i,
    connectorKitSectionsPerKit,
    setConnectorKitSectionsPerKit,
    spec,
    refetch,
    specLoading,
    specError,
    specErrorObj,
    specFetching,
    projectSettings,
    accessories,
    availableGenerateVariants,
    mut,
    saveMut,
    items,
    isSpecStale,
    isSpecPartial,
    excludedGroups,
    saveDefaultsMut,
    runGenerate,
    confirmPartialGenerate,
    hasItems,
    handleAdd,
    handleDelete,
    categoriesCount,
    fullModeActive,
    formedAt,
    generateButtonLabel,
    scopeSwitchDisabled,
    erTabItems,
    navigate,
  } = m;

  if (!project) {
    return (
      <EmptyProjectState
        icon={<UnorderedListOutlined style={{ marginRight: 8 }} />}
        title="Спецификация"
        description="Шаг 3 из 4. Автоматическое формирование перечня оборудования и материалов на основе расчётов."
      />
    );
  }

  if (variantContext.isLoading) {
    return (
      <Card size="small" aria-busy="true" aria-label="Загрузка списка ЭР">
        <Skeleton active title paragraph={{ rows: 4 }} />
      </Card>
    );
  }

  if (variantContext.isError) {
    return (
      <QueryError
        error={variantContext.error}
        title="Не удалось загрузить список ЭР"
        onRetry={() => variantContext.refetch()}
        retrying={variantContext.isFetching}
      />
    );
  }

  if (!selectedElectricalVariant) {
    return (
      <Alert
        type="warning"
        showIcon
        message="ЭР ещё не создан"
        description="Завершите теплорасчёт и создайте первый ЭР на шаге 2."
        action={<Button onClick={() => navigate(ROUTES.elecCalc)}>К электрорасчёту</Button>}
      />
    );
  }

  if (variantContext.legacyVariantNumber == null) {
    return (
      <Alert
        type="warning"
        showIcon
        message={`«${selectedElectricalVariant.name}»: спецификация временно недоступна`}
        description="UUID-версия спецификации относится к Phase 5. Данные другого ЭР не подставляются."
        action={<Button onClick={() => navigate(ROUTES.elecCalc)}>Выбрать другой ЭР</Button>}
      />
    );
  }

  return (
    <div className="specification-page" data-testid="specification-page">
      {!canMutateProject && (
        <Alert
          type="info"
          showIcon
          message="Режим просмотра"
          description="Изменять или пересчитывать спецификацию может только владелец проекта или администратор."
          style={{ marginBottom: 12 }}
        />
      )}

      {/* Toolbar: ER tabs + Обновить + Настройки */}
      <div className="specification-toolbar">
        <Tabs
          className="specification-er-tabs"
          type="card"
          size="small"
          activeKey={selectedElectricalVariant.id}
          onChange={(id) => {
            if (!scopeSwitchDisabled) variantContext.selectVariant(id);
          }}
          items={erTabItems}
          tabBarExtraContent={(
            <Space size={8} className="specification-toolbar-actions">
              <Button
                icon={<ReloadOutlined />}
                loading={mut.isPending}
                disabled={!canMutateProject}
                onClick={() => runGenerate(false)}
                aria-label={generateButtonLabel}
              >
                {generateButtonLabel}
              </Button>
              <Button
                icon={<SettingOutlined />}
                onClick={() => toggleSettings(true)}
                aria-label="Настройки"
              >
                Настройки
              </Button>
            </Space>
          )}
        />
      </div>

      {/* Compact status strip */}
      {canMutateProject && (
        <div className="specification-status-strip">
          <Text type="secondary" style={{ fontSize: 12 }}>
            {selectedElectricalVariant.name}
            {' · '}
            {isSpecStale
              ? 'устарела'
              : isSpecPartial
                ? 'НЕПОЛНАЯ'
                : hasItems
                  ? 'полная'
                  : 'не сформирована'}
            {' · '}
            позиций: {items.length}
            {isEmployee && hasItems && (
              <>
                {' · '}
                ручных: {items.filter((i) => i.source === 'manual').length}
              </>
            )}
          </Text>
        </div>
      )}

      {isSpecStale && (
        <Alert
          className="specification-empty-alert specification-stale-banner"
          type="error"
          showIcon
          message="Спецификация устарела — не для закупки / печати / отчёта"
          description="Snapshot только для просмотра. Итоги, печать, отчёт и export не используют эти количества. Сформируйте спецификацию заново."
          style={{ marginBottom: 12 }}
          action={
            <Button
              size="small"
              type="primary"
              icon={<ReloadOutlined />}
              loading={mut.isPending}
              disabled={!canMutateProject}
              onClick={() => runGenerate(false)}
            >
              Сформировать заново
            </Button>
          }
        />
      )}

      {!isSpecStale && isSpecPartial && hasItems && (
        <Alert
          className="specification-partial-banner"
          type="warning"
          showIcon
          message="Неполная спецификация — не использовать как полный закупочный комплект"
          description={
            excludedGroups.length
              ? (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {excludedGroups.map((g) => (
                      <li key={String(g.error_code || g.group || g.message)}>
                        <strong>{g.error_code || g.group}</strong>
                        {g.message ? ` — ${g.message}` : ''}
                      </li>
                    ))}
                  </ul>
                )
              : 'Часть групп BOM исключена (секции, коробки или недоказанные методики).'
          }
          style={{ marginBottom: 12 }}
        />
      )}

      {specError && !spec ? (
        <QueryError
          error={specErrorObj}
          title="Не удалось загрузить спецификацию"
          onRetry={() => refetch()}
          retrying={specFetching}
        />
      ) : specLoading ? (
        <div aria-busy="true" aria-label="Загрузка спецификации">
          <Skeleton active title={false} paragraph={{ rows: 6 }} />
        </div>
      ) : (
        <>
          {!hasItems && (
            <Alert
              className="specification-empty-alert"
              type="warning"
              showIcon
              message="Спецификация не сформирована"
              description="Убедитесь, что для всех объектов выполнен электрорасчёт (шаг 2), затем нажмите «Сформировать»."
              style={{ marginBottom: 12 }}
              action={
                <Space>
                  <Button
                    size="small"
                    type="primary"
                    icon={<ReloadOutlined />}
                    loading={mut.isPending}
                    disabled={!canMutateProject}
                    onClick={() => runGenerate(false)}
                  >
                    Сформировать
                  </Button>
                  <Button
                    size="small"
                    icon={<ThunderboltOutlined />}
                    onClick={() => navigate(ROUTES.elecCalc)}
                  >
                    К электрорасчёту
                  </Button>
                </Space>
              }
            />
          )}

          <div className={isSpecStale ? 'spec-table-print-exclude' : undefined}>
            <SpecTable
              items={items}
              groupBy={groupBy}
              mergeIdentical={mergeIdentical}
              canDelete={canManuallyEdit && hasItems && !isSpecStale}
              isStale={isSpecStale}
              onDelete={handleDelete}
            />
          </div>
        </>
      )}

      {/* Footer: timestamp + report */}
      <div className="specification-footer">
        <Text type="secondary" className="specification-footer-meta">
          {hasItems && formedAt
            ? `Спецификация сформирована: ${formedAt}`
            : hasItems
              ? 'Спецификация сформирована'
              : 'Спецификация ещё не сформирована'}
        </Text>
        <Button
          icon={<DownloadOutlined />}
          onClick={() => navigate(ROUTES.report)}
          disabled={!hasItems || isSpecStale}
        >
          Сформировать отчёт
        </Button>
      </div>

      {/* Settings drawer — параметры генерации и группировки */}
      <SpecPageChrome
        settingsOpen={settingsOpen}
        toggleSettings={toggleSettings}
        canMutateProject={canMutateProject}
        fullModeActive={fullModeActive}
        selectedGenerateErIds={selectedGenerateErIds}
        setSelectedGenerateErIds={setSelectedGenerateErIds}
        availableGenerateVariants={availableGenerateVariants}
        reserveCoeff={reserveCoeff}
        setReserveCoeff={setReserveCoeff}
        connectorKitSectionsPerKit={connectorKitSectionsPerKit}
        setConnectorKitSectionsPerKit={setConnectorKitSectionsPerKit}
        exZone={exZone}
        setExZone={setExZone}
        indicationOnBoxes={indicationOnBoxes}
        setIndicationOnBoxes={setIndicationOnBoxes}
        endSectionIndication={endSectionIndication}
        setEndSectionIndication={setEndSectionIndication}
        topIndication={topIndication}
        setTopIndication={setTopIndication}
        minLengthK2i={minLengthK2i}
        setMinLengthK2i={setMinLengthK2i}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        mergeIdentical={mergeIdentical}
        setMergeIdentical={setMergeIdentical}
        items={items}
        categoriesCount={categoriesCount}
        projectSettings={projectSettings}
        spec={spec}
        mut={mut}
        saveDefaultsMut={saveDefaultsMut}
        runGenerate={runGenerate}
        canManuallyEdit={canManuallyEdit}
        hasItems={hasItems}
        isSpecStale={isSpecStale}
        setAddOpen={setAddOpen}
        addOpen={addOpen}
        handleAdd={handleAdd}
        saveMut={saveMut}
        selectedAccessoryId={selectedAccessoryId}
        setSelectedAccessoryId={setSelectedAccessoryId}
        qty={qty}
        setQty={setQty}
        accessories={accessories}
        preflightOpen={preflightOpen}
        setPreflightOpen={setPreflightOpen}
        setPendingGenerate={setPendingGenerate}
        confirmPartialGenerate={confirmPartialGenerate}
        preflightSummary={preflightSummary}
      />
    </div>
  );
}
