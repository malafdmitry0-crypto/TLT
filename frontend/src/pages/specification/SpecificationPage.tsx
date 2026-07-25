import {
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
import { TltAlert, TltButton, TltCard } from '@/components/ui-kit';
import { ROUTES } from '@/routes/routes';
import { useSpecificationPageModel } from '@/pages/specification/useSpecificationPageModel';
import { SpecPageChrome } from '@/pages/specification/SpecPageChrome';
import './specification-page.css';

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
        icon={<UnorderedListOutlined className="specification-empty-icon" />}
        title="Спецификация"
        description="Шаг 3 из 4. Автоматическое формирование перечня оборудования и материалов на основе расчётов."
      />
    );
  }

  if (variantContext.isLoading) {
    return (
      <TltCard padding="compact" aria-busy="true" aria-label="Загрузка списка ЭР">
        <Skeleton active title paragraph={{ rows: 4 }} />
      </TltCard>
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
      <TltAlert
        tone="warning"
        title="ЭР ещё не создан"
        action={<TltButton onClick={() => navigate(ROUTES.elecCalc)}>К электрорасчёту</TltButton>}
      >
        Завершите теплорасчёт и создайте первый ЭР на шаге 2.
      </TltAlert>
    );
  }

  if (variantContext.legacyVariantNumber == null) {
    return (
      <TltAlert
        tone="warning"
        title={`«${selectedElectricalVariant.name}»: спецификация временно недоступна`}
        action={<TltButton onClick={() => navigate(ROUTES.elecCalc)}>Выбрать другой ЭР</TltButton>}
      >
        UUID-версия спецификации относится к Phase 5. Данные другого ЭР не подставляются.
      </TltAlert>
    );
  }

  return (
    <div className="specification-page" data-testid="specification-page">
      {!canMutateProject && (
        <TltAlert
          tone="info"
          title="Режим просмотра"
          className="specification-alert-gap"
        >
          Изменять или пересчитывать спецификацию может только владелец проекта или администратор.
        </TltAlert>
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
              <TltButton
                icon={<ReloadOutlined />}
                loading={mut.isPending}
                disabled={!canMutateProject}
                onClick={() => runGenerate(false)}
                aria-label={generateButtonLabel}
              >
                {generateButtonLabel}
              </TltButton>
              <TltButton
                icon={<SettingOutlined />}
                onClick={() => toggleSettings(true)}
                aria-label="Настройки"
              >
                Настройки
              </TltButton>
            </Space>
          )}
        />
      </div>

      {/* Compact status strip */}
      {canMutateProject && (
        <div className="specification-status-strip">
          <Text type="secondary" className="specification-status-text">
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
        <TltAlert
          className="specification-empty-alert specification-stale-banner specification-alert-gap"
          tone="danger"
          title="Спецификация устарела — не для закупки / печати / отчёта"
          action={
            <TltButton
              size="compact"
              variant="primary"
              icon={<ReloadOutlined />}
              loading={mut.isPending}
              disabled={!canMutateProject}
              onClick={() => runGenerate(false)}
            >
              Сформировать заново
            </TltButton>
          }
        >
          Snapshot только для просмотра. Итоги, печать, отчёт и export не используют эти количества.
          Сформируйте спецификацию заново.
        </TltAlert>
      )}

      {!isSpecStale && isSpecPartial && hasItems && (
        <TltAlert
          className="specification-partial-banner specification-alert-gap"
          tone="warning"
          title="Неполная спецификация — не использовать как полный закупочный комплект"
        >
          {excludedGroups.length
            ? (
                <ul className="specification-partial-list">
                  {excludedGroups.map((g) => (
                    <li key={String(g.error_code || g.group || g.message)}>
                      <strong>{g.error_code || g.group}</strong>
                      {g.message ? ` — ${g.message}` : ''}
                    </li>
                  ))}
                </ul>
              )
            : 'Часть групп BOM исключена (секции, коробки или недоказанные методики).'}
        </TltAlert>
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
            <TltAlert
              className="specification-empty-alert specification-alert-gap"
              tone="warning"
              title="Спецификация не сформирована"
              action={
                <Space>
                  <TltButton
                    size="compact"
                    variant="primary"
                    icon={<ReloadOutlined />}
                    loading={mut.isPending}
                    disabled={!canMutateProject}
                    onClick={() => runGenerate(false)}
                  >
                    Сформировать
                  </TltButton>
                  <TltButton
                    size="compact"
                    icon={<ThunderboltOutlined />}
                    onClick={() => navigate(ROUTES.elecCalc)}
                  >
                    К электрорасчёту
                  </TltButton>
                </Space>
              }
            >
              Убедитесь, что для всех объектов выполнен электрорасчёт (шаг 2), затем нажмите «Сформировать».
            </TltAlert>
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
        <TltButton
          icon={<DownloadOutlined />}
          onClick={() => navigate(ROUTES.report)}
          disabled={!hasItems || isSpecStale}
        >
          Сформировать отчёт
        </TltButton>
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
