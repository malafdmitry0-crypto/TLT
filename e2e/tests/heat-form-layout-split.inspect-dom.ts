/** Browser DOM collector for heat-form-layout e2e (machine gate). */
export function collectHeatFormInspection() {
    type Issue = { type: string; selector: string; details: string };
    const issues: Issue[] = [];
    const labelPlacementIssues: Issue[] = [];
    const wideLabelFlowIssues: Issue[] = [];
    const wideLayerRowIssues: Issue[] = [];
    const wideCompactIssues: Issue[] = [];
    const wideSectionLayoutIssues: Issue[] = [];
    const form = document.querySelector<HTMLElement>('.inline-object-form');
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 1
        && rect.height > 1
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0.01;
    };
    const describe = (el: Element) => {
      const id = el.id ? `#${el.id}` : '';
      const testId = el.getAttribute('data-testid');
      const className = String(el.getAttribute('class') || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map((name) => `.${name}`)
        .join('');
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      return `${el.tagName.toLowerCase()}${id}${className}${testId ? `[data-testid="${testId}"]` : text ? ` "${text}"` : ''}`;
    };
    if (!form) {
      return {
        formClass: null,
        shellLayout: null,
        formLayout: null,
        widePanelCount: 0,
        sidePanelCount: 0,
        wideGridCount: 0,
        sideGridCount: 0,
        visibleResizeHandleCount: 0,
        sideSectionCount: 0,
        labelPlacementIssues,
        wideLabelFlowIssues,
        wideLayerRowIssues,
        wideCompactIssues,
        wideSectionLayoutIssues,
        issues: [{ type: 'missing-form', selector: '.inline-object-form', details: 'form not found' }],
      };
    }
    const formLayout = form.dataset.layout ?? null;
    const documentOverflow =
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
      document.documentElement.clientWidth;
    if (documentOverflow > 2) {
      issues.push({
        type: 'page-horizontal-overflow',
        selector: 'document',
        details: `overflow=${documentOverflow}px`,
      });
    }
    if (form.scrollWidth - form.clientWidth > 2) {
      issues.push({
        type: 'form-horizontal-overflow',
        selector: describe(form),
        details: `scrollWidth=${form.scrollWidth}, clientWidth=${form.clientWidth}`,
      });
    }
    const textNodes = Array.from(form.querySelectorAll<HTMLElement>([
      'label',
      '.reference-picker-value',
      '.tlt-select__value',
      '.ant-select-selection-item',
      '.ant-select-selection-placeholder',
      '.unit-input-number__addon',
    ].join(','))).filter(visible);
    for (const el of textNodes) {
      const style = window.getComputedStyle(el);
      if (style.textOverflow === 'ellipsis') continue;
      if (el.scrollWidth - el.clientWidth > 4) {
        issues.push({
          type: 'text-horizontal-clipping',
          selector: describe(el),
          details: `scrollWidth=${el.scrollWidth}, clientWidth=${el.clientWidth}`,
        });
      }
      if (el.scrollHeight - el.clientHeight > 4 && style.overflowY !== 'visible') {
        issues.push({
          type: 'text-vertical-clipping',
          selector: describe(el),
          details: `scrollHeight=${el.scrollHeight}, clientHeight=${el.clientHeight}`,
        });
      }
    }
    const controlSelector = [
      'input',
      'button',
      '.ant-input-number',
      '.reference-picker-control',
      '.tlt-select__trigger',
      '.ant-select-selector',
    ].join(',');
    const controls = Array.from(form.querySelectorAll<HTMLElement>(controlSelector)).filter(visible);
    for (let i = 0; i < controls.length; i += 1) {
      const a = controls[i];
      const aRect = a.getBoundingClientRect();
      for (let j = i + 1; j < controls.length; j += 1) {
        const b = controls[j];
        if (a.contains(b) || b.contains(a)) continue;
        if (a.closest('.ant-form-item') === b.closest('.ant-form-item')) continue;
        const bRect = b.getBoundingClientRect();
        const x = Math.max(0, Math.min(aRect.right, bRect.right) - Math.max(aRect.left, bRect.left));
        const y = Math.max(0, Math.min(aRect.bottom, bRect.bottom) - Math.max(aRect.top, bRect.top));
        if (x <= 2 || y <= 2) continue;
        const overlap = x * y;
        const smaller = Math.min(aRect.width * aRect.height, bRect.width * bRect.height);
        if (smaller > 0 && overlap / smaller > 0.35) {
          issues.push({
            type: 'interactive-overlap',
            selector: `${describe(a)} <-> ${describe(b)}`,
            details: `overlap=${Math.round(overlap)}px2`,
          });
        }
      }
    }
    const formItems = Array.from(form.querySelectorAll<HTMLElement>('.ant-form-item')).filter(visible);
    const labeledTargets: Array<{
      item: HTMLElement;
      label: HTMLElement;
      labelRect: DOMRect;
      controlTarget?: HTMLElement;
      controlRect?: DOMRect;
    }> = [];
    for (const item of formItems) {
      const row = item.querySelector<HTMLElement>(':scope > .ant-form-item-row');
      const label = row?.querySelector<HTMLElement>(':scope > .ant-form-item-label > label');
      const control = row?.querySelector<HTMLElement>(':scope > .ant-form-item-control');
      if (!row || !label || !control || !visible(label)) continue;
      const controlTarget = Array.from(control.querySelectorAll<HTMLElement>(controlSelector)).find(visible);
      if (!controlTarget) continue;
      const labelRect = label.getBoundingClientRect();
      const controlRect = controlTarget.getBoundingClientRect();
      labeledTargets.push({ item, label, labelRect, controlTarget, controlRect });
      if (labelRect.bottom - controlRect.top > 2) {
        labelPlacementIssues.push({
          type: 'label-not-above-control',
          selector: describe(item),
          details: `labelBottom=${Math.round(labelRect.bottom)}, controlTop=${Math.round(controlRect.top)}`,
        });
      }
      if (formLayout === 'wide') {
        const labelText = label.querySelector<HTMLElement>('span') ?? label;
        const labelTextRect = labelText.getBoundingClientRect();
        const labelTextStyle = window.getComputedStyle(labelText);
        const labelLineHeight = Number.parseFloat(labelTextStyle.lineHeight)
          || Number.parseFloat(labelTextStyle.fontSize) * 1.2
          || 12;
        if (labelTextRect.height - (labelLineHeight * 2) > 3) {
          wideLabelFlowIssues.push({
            type: 'wide-label-exceeds-two-lines',
            selector: describe(item),
            details: `labelHeight=${Math.round(labelTextRect.height)}, lineHeight=${Math.round(labelLineHeight)}`,
          });
        }
      }
    }
    if (formLayout === 'wide') {
      const wideColumns = Array.from(form.querySelectorAll<HTMLElement>('.object-wizard-wide-panel .form-col-srs'));
      const primaryPanel = form.querySelector<HTMLElement>('.object-wizard-wide-panel .form-col-srs--primary');
      const fittingsPanel = form.querySelector<HTMLElement>('.object-wizard-wide-panel .form-col-srs--fittings');
      const temperaturePanel = form.querySelector<HTMLElement>('.object-wizard-wide-panel .form-col-srs--climate');
      const insulationPanel = form.querySelector<HTMLElement>('.object-wizard-wide-panel .form-col-srs--insulation');
      const pipeMaterial = primaryPanel?.querySelector<HTMLElement>('.pipe-material-form-item');
      const primaryPlacement = primaryPanel
        ?.querySelector<HTMLElement>('[data-testid="placement-select"]')
        ?.closest<HTMLElement>('.ant-form-item');
      const temperaturePlacement = temperaturePanel
        ?.querySelector<HTMLElement>('[data-testid="placement-select"]')
        ?.closest<HTMLElement>('.ant-form-item');
      if (primaryPlacement && visible(primaryPlacement)) {
        wideCompactIssues.push({
          type: 'wide-field-in-wrong-column',
          selector: describe(primaryPlacement),
          details: 'placement must be in climate/temperature column',
        });
      }
      if (!temperaturePlacement || !visible(temperaturePlacement)) {
        wideCompactIssues.push({
          type: 'wide-field-missing-in-temperature-column',
          selector: '.object-wizard-wide-panel .form-col-srs--climate [data-testid="placement-select"]',
          details: 'placement not found in climate/temperature column',
        });
      }
      for (const testId of [
        'alpha-vnesh-input',
        'safety-factor-input',
        'local-element-equiv-length-input',
        'pipe-lambda-mode-select',
      ]) {
        const obsoleteControl = form.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
        if (obsoleteControl && visible(obsoleteControl)) {
          wideCompactIssues.push({
            type: 'obsolete-heat-form-control-visible',
            selector: describe(obsoleteControl),
            details: `${testId} must not be editable in the heat-loss form`,
          });
        }
      }
      for (const [name, item, maxWidth] of [
        ['pipe-material', pipeMaterial, 430],
        ['placement', temperaturePlacement, 390],
      ] as const) {
        if (!item || !visible(item)) continue;
        const rect = item.getBoundingClientRect();
        if (rect.width > maxWidth) {
          wideCompactIssues.push({
            type: 'wide-field-too-wide',
            selector: describe(item),
            details: `${name} width=${Math.round(rect.width)}, max=${maxWidth}`,
          });
        }
      }
      const layerCount = form.querySelector<HTMLElement>('.object-wizard-wide-panel .insulation-layer-count-form-item');
      const temperatureBasis = form.querySelector<HTMLElement>('.object-wizard-wide-panel .insulation-temperature-basis-form-item');
      if (layerCount && temperatureBasis && visible(layerCount) && visible(temperatureBasis)) {
        const countRect = layerCount.getBoundingClientRect();
        const basisRect = temperatureBasis.getBoundingClientRect();
        if (Math.abs(countRect.top - basisRect.top) > 3 || Math.abs(countRect.bottom - basisRect.bottom) > 3) {
          wideCompactIssues.push({
            type: 'wide-insulation-settings-not-one-row',
            selector: `${describe(layerCount)} <-> ${describe(temperatureBasis)}`,
            details: `tops=${Math.round(countRect.top)}/${Math.round(basisRect.top)}, bottoms=${Math.round(countRect.bottom)}/${Math.round(basisRect.bottom)}`,
          });
        }
      }
      const layerGroups = Array.from(
        form.querySelectorAll<HTMLElement>('.object-wizard-wide-panel .insulation-layer-group'),
      ).filter(visible);
      if (window.innerWidth >= 1180 && insulationPanel && visible(insulationPanel) && layerGroups.length === 1) {
        const groupRect = layerGroups[0].getBoundingClientRect();
        const insulationRect = insulationPanel.getBoundingClientRect();
        if (groupRect.width < insulationRect.width * 0.55) {
          wideSectionLayoutIssues.push({
            type: 'wide-single-insulation-layer-too-narrow',
            selector: '.object-wizard-wide-panel .insulation-layer-group',
            details: `groupWidth=${Math.round(groupRect.width)}, insulationWidth=${Math.round(insulationRect.width)}`,
          });
        }
      }
      if (window.innerWidth >= 1180 && layerGroups.length >= 2) {
        const groupRects = layerGroups.map((group) => group.getBoundingClientRect());
        const tableRowsAligned = groupRects.every((rect, index) => (
          Math.abs(rect.left - groupRects[0].left) <= 3
          && Math.abs(rect.width - groupRects[0].width) <= 3
          && (index === 0 || rect.top >= groupRects[index - 1].bottom - 3)
        ));
        if (!tableRowsAligned) {
          wideSectionLayoutIssues.push({
            type: 'wide-insulation-layer-groups-not-table-rows',
            selector: '.object-wizard-wide-panel .insulation-layer-group',
            details: `rects=${groupRects.map((rect) => `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}`).join('/')}`,
          });
        }
      }
      layerGroups.forEach((group, groupIndex) => {
        const rowItems = [
          group.querySelector<HTMLElement>('.short-number-form-item'),
          group.querySelector<HTMLElement>('.coefficient-form-item'),
          group.querySelector<HTMLElement>('.insulation-temperature-range-form-item'),
        ].filter((item): item is HTMLElement => Boolean(item && visible(item)));
        if (rowItems.length !== 3) return;
        const rects = rowItems.map((item) => item.getBoundingClientRect());
        const minTop = Math.min(...rects.map((rect) => rect.top));
        const maxTop = Math.max(...rects.map((rect) => rect.top));
        const minBottom = Math.min(...rects.map((rect) => rect.bottom));
        const maxBottom = Math.max(...rects.map((rect) => rect.bottom));
        if (maxTop - minTop > 3 || maxBottom - minBottom > 3) {
          wideLayerRowIssues.push({
            type: 'wide-layer-fields-not-one-row',
            selector: describe(group),
            details: `group=${groupIndex + 1}, tops=${rects.map((rect) => Math.round(rect.top)).join('/')}, bottoms=${rects.map((rect) => Math.round(rect.bottom)).join('/')}`,
          });
        }
      });
      if (
        primaryPanel && fittingsPanel && temperaturePanel && insulationPanel
        && visible(primaryPanel)
        && visible(fittingsPanel)
        && visible(temperaturePanel)
        && visible(insulationPanel)
      ) {
        const topRects = [primaryPanel, temperaturePanel].map((section) => section.getBoundingClientRect());
        const fittingsRect = fittingsPanel.getBoundingClientRect();
        const insulationRect = insulationPanel.getBoundingClientRect();
        const gridRect = form.querySelector<HTMLElement>('.object-wizard-wide-panel .form-grid-srs')?.getBoundingClientRect();
        const minTop = Math.min(...topRects.map((rect) => rect.top));
        const maxTop = Math.max(...topRects.map((rect) => rect.top));
        const maxFirstRowBottom = Math.max(...topRects.map((rect) => rect.bottom));
        if (maxTop - minTop > 3) {
          wideSectionLayoutIssues.push({
            type: 'wide-top-sections-not-one-row',
            selector: '.object-wizard-wide-panel .form-col-srs--primary/.form-col-srs--climate',
            details: `tops=${topRects.map((rect) => Math.round(rect.top)).join('/')}`,
          });
        }
        if (fittingsRect.top - maxFirstRowBottom < -3) {
          wideSectionLayoutIssues.push({
            type: 'wide-fittings-not-below-top-row',
            selector: '.object-wizard-wide-panel .form-col-srs--fittings',
            details: `fittingsTop=${Math.round(fittingsRect.top)}, topBottom=${Math.round(maxFirstRowBottom)}`,
          });
        }
        if (insulationRect.top - fittingsRect.bottom < -3) {
          wideSectionLayoutIssues.push({
            type: 'wide-insulation-not-below-fittings',
            selector: '.object-wizard-wide-panel .form-col-srs--insulation',
            details: `insulationTop=${Math.round(insulationRect.top)}, fittingsBottom=${Math.round(fittingsRect.bottom)}`,
          });
        }
        if (gridRect && (
          Math.abs(insulationRect.left - gridRect.left) > 3
          || Math.abs(insulationRect.right - gridRect.right) > 3
        )) {
          wideSectionLayoutIssues.push({
            type: 'wide-insulation-not-full-width',
            selector: '.object-wizard-wide-panel .form-col-srs--insulation',
            details: `insulation=${Math.round(insulationRect.left)}/${Math.round(insulationRect.right)}, grid=${Math.round(gridRect.left)}/${Math.round(gridRect.right)}`,
          });
        }
        if (gridRect && (
          Math.abs(fittingsRect.left - gridRect.left) > 3
          || Math.abs(fittingsRect.right - gridRect.right) > 3
        )) {
          wideSectionLayoutIssues.push({
            type: 'wide-fittings-not-full-width',
            selector: '.object-wizard-wide-panel .form-col-srs--fittings',
            details: `fittings=${Math.round(fittingsRect.left)}/${Math.round(fittingsRect.right)}, grid=${Math.round(gridRect.left)}/${Math.round(gridRect.right)}`,
          });
        }
      }
    }
    const overlapArea = (left: DOMRect, right: DOMRect) => {
      const x = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
      const y = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
      return { x, y, area: x * y };
    };
    for (let i = 0; i < labeledTargets.length; i += 1) {
      const current = labeledTargets[i];
      for (let j = 0; j < labeledTargets.length; j += 1) {
        if (i === j) continue;
        const other = labeledTargets[j];
        const labelControlOverlap = other.controlRect
          ? overlapArea(current.labelRect, other.controlRect)
          : { x: 0, y: 0, area: 0 };
        if (labelControlOverlap.x > 2 && labelControlOverlap.y > 2 && labelControlOverlap.area > 12) {
          issues.push({
            type: 'label-control-overlap',
            selector: `${describe(current.item)} -> ${describe(other.controlTarget ?? other.item)}`,
            details: `overlap=${Math.round(labelControlOverlap.area)}px2`,
          });
        }
        const labelLabelOverlap = overlapArea(current.labelRect, other.labelRect);
        if (labelLabelOverlap.x > 2 && labelLabelOverlap.y > 2 && labelLabelOverlap.area > 12) {
          issues.push({
            type: 'label-label-overlap',
            selector: `${describe(current.item)} -> ${describe(other.item)}`,
            details: `overlap=${Math.round(labelLabelOverlap.area)}px2`,
          });
        }
      }
    }
    return {
      formClass: form.getAttribute('class'),
      shellLayout: document.querySelector<HTMLElement>('[aria-label="Блок заполнения параметров"]')?.dataset.layout ?? null,
      formLayout: form.dataset.layout ?? null,
      widePanelCount: form.querySelectorAll('.object-wizard-wide-panel[data-panel="wide"]').length,
      sidePanelCount: form.querySelectorAll('.object-wizard-side-panel[data-panel="side"]').length,
      wideSectionCount: form.querySelectorAll('.object-wizard-wide-panel .form-col-srs').length,
      wideBannerCount: form.querySelectorAll('.object-wizard-wide-panel .inline-form-section-banner').length,
      wideHeadings: Array
        .from(form.querySelectorAll<HTMLElement>('.form-col-srs > h4'))
        .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
      sideHeadings: Array
        .from(form.querySelectorAll<HTMLElement>('.side-form-section > h4'))
        .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
      wideGridCount: form.querySelectorAll('.form-grid-srs').length,
      sideGridCount: form.querySelectorAll('.side-form-grid-srs').length,
      visibleResizeHandleCount: Array
        .from(form.querySelectorAll<HTMLElement>('.form-col-resize-handle'))
        .filter((el) => getComputedStyle(el).display !== 'none').length,
      sideSectionCount: form.querySelectorAll('.side-form-section').length,
      labelPlacementIssues,
      wideLabelFlowIssues,
      wideLayerRowIssues,
      wideCompactIssues,
      wideSectionLayoutIssues,
      issues,
    };
}
