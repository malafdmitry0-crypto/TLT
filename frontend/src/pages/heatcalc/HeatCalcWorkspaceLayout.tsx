/**
 * @module heatcalc/workspace-layout
 * @owner heat
 * @depends none
 * @does-not electrical
 *
 * Placement-aware shell: type/actions bars, form panes, side resize, table pane.
 */
import type { CSSProperties, ReactNode, Ref } from 'react';
import { Space } from 'antd';

import type { HeatCalcFormPlacement } from '@/pages/heatcalc/heatCalcLayoutModel';
import './heatcalc-workspace.css';
import './heatcalc-workspace-shell.css';
import './heatcalc-dual-form-shell.css';
import './heatcalc-side-form-layout.css';
import './heatcalc-field-chrome-core.css';
import './heatcalc-field-chrome.css';
import './heatcalc-workspace-table.css';
import './heatcalc-insulation-page.css';

export type HeatCalcWorkspaceLayoutProps = {
  formPlacement: HeatCalcFormPlacement;
  isSideFormPlacement: boolean;
  sideResizeVisible: boolean;
  workspaceLayoutStyle?: CSSProperties;
  sideWorkspaceRef: Ref<HTMLDivElement>;
  typeBar: ReactNode;
  actionsBar: ReactNode;
  jobAlert: ReactNode;
  formPanel: ReactNode;
  tablePane: ReactNode;
  errorsOverlay: ReactNode;
  onSideResizePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onSideResizeMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
};

function SideResizeHandle({
  visible,
  onPointerDown,
  onMouseDown,
}: {
  visible: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  if (!visible) return null;
  return (
    <div
      className="heatcalc-side-resize-handle"
      role="separator"
      aria-label="Изменить ширину областей"
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onMouseDown={onMouseDown}
    />
  );
}

export function HeatCalcWorkspaceLayout({
  formPlacement,
  isSideFormPlacement,
  sideResizeVisible,
  workspaceLayoutStyle,
  sideWorkspaceRef,
  typeBar,
  actionsBar,
  jobAlert,
  formPanel,
  tablePane,
  errorsOverlay,
  onSideResizePointerDown,
  onSideResizeMouseDown,
}: HeatCalcWorkspaceLayoutProps) {
  return (
    <div className="heatcalc-workspace-shell">
      {errorsOverlay}
      <Space direction="vertical" size={5} style={{ width: '100%' }}>
        {!isSideFormPlacement && typeBar}
        {formPlacement === 'top' && formPanel}
        {!isSideFormPlacement && actionsBar}
        {!isSideFormPlacement && jobAlert}

        <div
          ref={sideWorkspaceRef}
          className={`heatcalc-workspace-layout heatcalc-workspace-layout--${formPlacement}`}
          style={workspaceLayoutStyle}
        >
          {formPlacement === 'left' && formPanel}
          {formPlacement === 'left' && (
            <SideResizeHandle
              visible={sideResizeVisible}
              onPointerDown={onSideResizePointerDown}
              onMouseDown={onSideResizeMouseDown}
            />
          )}
          <div className="heatcalc-table-pane">
            {isSideFormPlacement && typeBar}
            {isSideFormPlacement && actionsBar}
            {isSideFormPlacement && jobAlert}
            {tablePane}
          </div>
          {formPlacement === 'right' && (
            <SideResizeHandle
              visible={sideResizeVisible}
              onPointerDown={onSideResizePointerDown}
              onMouseDown={onSideResizeMouseDown}
            />
          )}
          {formPlacement === 'right' && formPanel}
        </div>
        {formPlacement === 'bottom' && formPanel}
      </Space>
    </div>
  );
}
