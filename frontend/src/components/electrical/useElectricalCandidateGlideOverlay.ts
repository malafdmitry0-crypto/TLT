/**
 * Filter popup + action menu overlay state for ElectricalCandidateGlideGrid.
 */
import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import type { MenuProps } from 'antd';
import type { HeaderClickedEventArgs } from '@glideapps/glide-data-grid';
import type { HeatCalcGlideGridColumn } from '@/utils/heatCalcGlideGrid';

export interface CandidateFilterPopupState {
  columnIndex: number;
  left: number;
  top: number;
}

export interface CandidateActionMenuState {
  items: MenuProps['items'];
  left: number;
  top: number;
}

export function useElectricalCandidateGlideOverlay(
  gridColumns: HeatCalcGlideGridColumn[],
) {
  const [filterPopup, setFilterPopup] = useState<CandidateFilterPopupState | null>(null);
  const [actionMenu, setActionMenu] = useState<CandidateActionMenuState | null>(null);
  const [hoveredHeaderColumnIndex, setHoveredHeaderColumnIndex] = useState<number | null>(null);

  const openFilterPopup = useCallback((columnIndex: number, event: HeaderClickedEventArgs) => {
    const column = gridColumns[columnIndex];
    if (!column?.filterable) return;
    event.preventDefault();
    setActionMenu(null);
    setFilterPopup({
      columnIndex,
      left: event.bounds.x,
      top: event.bounds.y + event.bounds.height,
    });
  }, [gridColumns]);

  const closeOverlays = useCallback(() => {
    setFilterPopup(null);
    setActionMenu(null);
  }, []);

  const openActionMenu = useCallback((state: CandidateActionMenuState) => {
    setFilterPopup(null);
    setActionMenu(state);
  }, []);

  const filterPopupStyle = useMemo<CSSProperties | undefined>(() => {
    if (!filterPopup) return undefined;
    return { left: filterPopup.left, top: filterPopup.top };
  }, [filterPopup]);

  const actionMenuStyle = useMemo<CSSProperties | undefined>(() => {
    if (!actionMenu) return undefined;
    return { left: actionMenu.left, top: actionMenu.top };
  }, [actionMenu]);

  return {
    filterPopup,
    setFilterPopup,
    actionMenu,
    setActionMenu,
    hoveredHeaderColumnIndex,
    setHoveredHeaderColumnIndex,
    openFilterPopup,
    closeOverlays,
    openActionMenu,
    filterPopupStyle,
    actionMenuStyle,
  };
}
