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
import { SpecCandidateSelectionPanel } from '@/pages/specification/SpecCandidateSelectionPanel';
import { readinessActionLabel } from '@/pages/specification/specificationReadinessModel';
import './specification-page.css';

const { Text } = Typography;

export default function SpecificationPage() {
  const m = useSpecificationPageModel();
  const {
    project,
    canMutateProject,
    canRespondToWorkflow,
    canManuallyEdit,
    isEmployee,
    variantContext,
    selectedElectricalVariant,
    settingsOpen,
    toggleSettings,
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
    generationWorkflowPending,
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
    groupingMode,
    setGroupingMode,
    generationDiagnostics,
    candidateGroups,
    draftCatalogSelections,
    selectCandidate,
    confirmCatalogSelections,
    spec,
    refetch,
    specLoading,
    specError,
    specErrorObj,
    specFetching,
    accessories,
    availableGenerateVariants,
    mut,
    saveMut,
    items,
    isSpecStale,
    runGenerate,
    confirmPartialGenerate,
    fixUnassignedAssignments,
    hasItems,
    handleAdd,
    handleDelete,
    formedAt,
    generateButtonLabel,
    scopeSwitchDisabled,
    erTabItems,
    navigate,
    readiness,
    retryReadiness,
    handleReadinessRecovery,
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

  const candidateSelectionRequired = candidateGroups.some(
    (group) => group.candidates.length > 1 && !group.selected_catalog_item_id,
  );
  const candidateSelectionPanel = candidateSelectionRequired ? (
    <SpecCandidateSelectionPanel
      groups={candidateGroups}
      draftSelections={draftCatalogSelections}
      onSelect={selectCandidate}
      onConfirm={confirmCatalogSelections}
      confirming={mut.isPending}
      disabled={!canMutateProject && !canRespondToWorkflow}
    />
  ) : null;

  return (
    <div className="specification-page" data-testid="specification-page">
      {!canMutateProject && (
        <TltAlert
          tone="info"
          title={<small>Режим просмотра</small>}
          className="specification-alert-gap"
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
              <TltButton
                icon={<ReloadOutlined />}
                loading={mut.isPending}
                disabled={!canMutateProject || generationWorkflowPending}
                onClick={() => toggleSettings(true)}
                aria-label={generateButtonLabel}
              >
                {generateButtonLabel}
              </TltButton>
              <TltButton
                icon={<SettingOutlined />}
                disabled={generationWorkflowPending}
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
              : hasItems
                ? 'полная'
                : 'не сформирована'}
            {' · '}
            позиций: {items.length}
            {readiness.state === 'blocked'
              && readiness.blockers.some((blocker) => blocker.scope === 'electrical_variant')
              && ' · ЭР требует перерасчёта'}
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
          title="Настройки проекта изменились после формирования спецификации. Для получения актуального результата сформируйте спецификацию повторно"
          action={
            <TltButton
              size="compact"
              variant="primary"
              icon={<ReloadOutlined />}
              loading={mut.isPending}
              disabled={!canMutateProject || generationWorkflowPending}
              onClick={readiness.state === 'blocked'
                ? handleReadinessRecovery
                : () => toggleSettings(true)}
            >
              {readiness.state === 'blocked' && readiness.primaryBlocker
                ? readinessActionLabel(readiness.primaryBlocker)
                : 'Сформировать заново'}
            </TltButton>
          }
        >
          Snapshot только для просмотра. Итоги, печать, отчёт и export не используют эти количества.
          Сформируйте спецификацию заново.
        </TltAlert>
      )}

      {candidateSelectionRequired && !settingsOpen && (
        <div className="specification-alert-gap">
          {candidateSelectionPanel}
        </div>
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
                    disabled={!canMutateProject || generationWorkflowPending}
                    onClick={() => toggleSettings(true)}
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

      {/* Settings drawer — параметры формирования спецификации */}
      <SpecPageChrome
        settingsOpen={settingsOpen}
        toggleSettings={toggleSettings}
        canMutateProject={canMutateProject}
        selectedGenerateErIds={selectedGenerateErIds}
        setSelectedGenerateErIds={setSelectedGenerateErIds}
        availableGenerateVariants={availableGenerateVariants}
        reserveCoeff={reserveCoeff}
        setReserveCoeff={setReserveCoeff}
        groupingMode={groupingMode}
        setGroupingMode={setGroupingMode}
        generationDiagnostics={generationDiagnostics}
        candidateSelection={settingsOpen ? candidateSelectionPanel : null}
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
        spec={spec}
        mut={mut}
        generationWorkflowPending={generationWorkflowPending}
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
        fixUnassignedAssignments={fixUnassignedAssignments}
        preflightSummary={preflightSummary}
        readiness={readiness}
        retryReadiness={retryReadiness}
        handleReadinessRecovery={handleReadinessRecovery}
      />
    </div>
  );
}
