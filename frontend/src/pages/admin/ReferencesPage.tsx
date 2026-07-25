import { useState } from 'react';
import { Table, Tabs, Typography } from 'antd';
import { TltBadge, TltCard, TltTextField } from '@/components/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import {
  getAccessories,
  getCablesTt,
  getCablesTlt,
  getClimate,
  getInsulation,
  getPipeMaterials,
  getResistiveCables,
  getSoilConductivity,
} from '@/api/references';
import './admin-layout.css';

const { Text } = Typography;
export default function ReferencesPage() {
  const [climateSearch, setClimateSearch] = useState('');

  const { data: climate = [], isFetching: climateLoading } = useQuery({
    queryKey: referenceQueryKeys.climate,
    queryFn: getClimate,
    ...referenceQueryOptions,
  });
  const { data: insulation = [], isFetching: insulLoading } = useQuery({
    queryKey: referenceQueryKeys.insulation,
    queryFn: getInsulation,
    ...referenceQueryOptions,
  });
  const { data: pipeMaterials = [], isFetching: pipeMatLoading } = useQuery({
    queryKey: referenceQueryKeys.pipeMaterials,
    queryFn: getPipeMaterials,
    ...referenceQueryOptions,
  });
  const { data: cables = [], isFetching: cablesLoading } = useQuery({
    queryKey: referenceQueryKeys.cablesTlt,
    queryFn: getCablesTlt,
    ...referenceQueryOptions,
  });
  const { data: ttCables = [], isFetching: ttCablesLoading } = useQuery({
    queryKey: referenceQueryKeys.ttCables,
    queryFn: getCablesTt,
    ...referenceQueryOptions,
  });
  const { data: resistive, isFetching: resistiveLoading } = useQuery({
    queryKey: referenceQueryKeys.resistiveCables('builtin'),
    queryFn: () => getResistiveCables('builtin'),
    ...referenceQueryOptions,
  });
  const { data: soil = [], isFetching: soilLoading } = useQuery({
    queryKey: referenceQueryKeys.soilConductivity,
    queryFn: getSoilConductivity,
    ...referenceQueryOptions,
  });
  const { data: accessories = [], isFetching: accLoading } = useQuery({
    queryKey: referenceQueryKeys.accessories,
    queryFn: getAccessories,
    ...referenceQueryOptions,
  });

  const filteredClimate = climate.filter(
    (c) =>
      !climateSearch ||
      c.city?.toLowerCase().includes(climateSearch.toLowerCase()) ||
      c.region?.toLowerCase().includes(climateSearch.toLowerCase())
  );

  return (
    <TltCard title="Встроенные справочники">
      <Tabs
        items={[
          {
            key: 'climate',
            label: `Климат (${climate.length})`,
            children: (
              <>
                <TltTextField
                  type="search"
                  placeholder="Поиск по городу или региону"
                  className="admin-references-search"
                  onChange={(value) => setClimateSearch(value)}
                  aria-label="Поиск по городу или региону"
                />
                <Table
                  size="small"
                  loading={climateLoading}
                  dataSource={filteredClimate}
                  rowKey={(r) => `${r.city}-${r.region}`}
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }}
                  columns={[
                    { title: 'Город', dataIndex: 'city', key: 'city', width: 160, sorter: (a, b) => (a.city ?? '').localeCompare(b.city ?? '') },
                    { title: 'Регион', dataIndex: 'region', key: 'region', width: 200 },
                    { title: 't₀.₉₈ (1 сут), °C', dataIndex: 't_cold_day_0_98', key: 't98', width: 130, render: (v: number) => v?.toFixed(1) ?? '—', sorter: (a, b) => (a.t_cold_day_0_98 ?? 0) - (b.t_cold_day_0_98 ?? 0) },
                    { title: 't абс. мин, °C', dataIndex: 't_abs_min', key: 'tabs', width: 120, render: (v: number) => v?.toFixed(1) ?? '—', sorter: (a, b) => (a.t_abs_min ?? 0) - (b.t_abs_min ?? 0) },
                    { title: 'Ветер ср., м/с', dataIndex: 'wind_avg_cold', key: 'wind', width: 120, render: (v: number) => v?.toFixed(1) ?? '—' },
                    { title: 'Ветер макс., м/с', dataIndex: 'wind_max_jan', key: 'windmax', width: 130, render: (v: number) => v?.toFixed(1) ?? '—' },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'insulation',
            label: `Изоляция (${insulation.length})`,
            children: (
              <Table
                size="small"
                loading={insulLoading}
                dataSource={insulation}
                rowKey="material"
                pagination={false}
                columns={[
                  { title: 'Наименование', dataIndex: 'name', key: 'name' },
                  { title: 'λ, Вт/(м·К)', dataIndex: 'conductivity', key: 'cond', width: 120, render: (v: number) => v.toFixed(3) },
                  {
                    title: 'Диапазон T, °C', key: 'range', width: 140,
                    render: (_: unknown, r) => r.temperature_range ? `${r.temperature_range[0]}..${r.temperature_range[1]}` : '—',
                  },
                  { title: 'Плотность, кг/м³', dataIndex: 'density_kg_m3', key: 'density', width: 140, render: (v) => v ?? '—' },
                ]}
              />
            ),
          },
          {
            key: 'pipe_materials',
            label: `Материалы труб (${pipeMaterials.length})`,
            children: (
              <Table
                size="small"
                loading={pipeMatLoading}
                dataSource={pipeMaterials}
                rowKey="material"
                pagination={false}
                columns={[
                  { title: 'Наименование', dataIndex: 'name', key: 'name' },
                  { title: 'Формула λ(T)', dataIndex: 'formula', key: 'formula', width: 200, render: (v: string) => <Text code>{v}</Text> },
                  { title: 'A', dataIndex: 'a', key: 'a', width: 80, render: (v: number) => v.toFixed(4) },
                  { title: 'B', dataIndex: 'b', key: 'b', width: 80, render: (v: number) => v.toFixed(6) },
                  { title: 'Точность', dataIndex: 'accuracy', key: 'accuracy', width: 100 },
                ]}
              />
            ),
          },
          {
            key: 'cables_tlt',
            label: `Кабели ТЛТ (${cables.length})`,
            children: (
              <Table
                size="small"
                loading={cablesLoading}
                dataSource={cables}
                rowKey="model"
                pagination={false}
                columns={[
                  { title: 'Марка', dataIndex: 'model', key: 'model', width: 120 },
                  { title: 'Бренд', dataIndex: 'brand', key: 'brand', width: 80 },
                  { title: 'Мощность, Вт/м', dataIndex: 'power_per_meter', key: 'power', width: 130, render: (v: number) => v.toFixed(0) },
                  { title: 'T мин, °C', dataIndex: 'min_temperature', key: 'tmin', width: 100 },
                  { title: 'T макс, °C', dataIndex: 'max_temperature', key: 'tmax', width: 100 },
                  { title: 'Напряжение, В', dataIndex: 'voltage', key: 'voltage', width: 120 },
                ]}
              />
            ),
          },
          {
            key: 'cables_tt',
            label: `Кабели ТТ (${ttCables.length})`,
            children: (
              <Table
                size="small"
                loading={ttCablesLoading}
                dataSource={ttCables}
                rowKey="model"
                pagination={false}
                scroll={{ x: 'max-content' }}
                columns={[
                  { title: 'Модель', dataIndex: 'model', key: 'model', width: 130 },
                  { title: 'Серия', dataIndex: 'series', key: 'series', width: 90, render: (v: string) => <TltBadge>{v}</TltBadge> },
                  { title: 'Номинал, Вт/м', dataIndex: 'nominal_power', key: 'nominal_power', width: 130 },
                  { title: 'q₁', dataIndex: 'q1', key: 'q1', width: 90, render: (v: number) => v.toFixed(4) },
                  { title: 'q₂', dataIndex: 'q2', key: 'q2', width: 90, render: (v: number) => v.toFixed(2) },
                  { title: 'T продукта макс., °C', dataIndex: 'max_product_temp', key: 'max_product_temp', width: 160 },
                  { title: 'T пропарки макс., °C', dataIndex: 'max_vapor_temp', key: 'max_vapor_temp', width: 160 },
                  { title: 'Напряжение, В', dataIndex: 'voltage', key: 'voltage', width: 120 },
                ]}
              />
            ),
          },
          {
            key: 'resistive',
            label: 'Резистивные кабели',
            children: (
              <Tabs
                size="small"
                items={[
                  {
                    key: 'single',
                    label: `Одножильные (${resistive?.single_core?.length ?? 0})`,
                    children: (
                      <Table
                        size="small"
                        loading={resistiveLoading}
                        dataSource={resistive?.single_core ?? []}
                        rowKey="model"
                        scroll={{ x: 'max-content' }}
                        pagination={{ pageSize: 20 }}
                        columns={[
                          { title: 'Марка', dataIndex: 'brand', key: 'brand', width: 100 },
                          { title: 'Модель', dataIndex: 'model', key: 'model', width: 160 },
                          { title: 'Ом/км', dataIndex: 'resistance_ohm_km', key: 'res', width: 80, render: (v: number) => v?.toFixed(1) ?? '—' },
                          { title: 'Сечение, мм²', dataIndex: 'conductor_section_mm2', key: 'sec', width: 110 },
                          { title: 'Диаметр, мм', dataIndex: 'diameter_mm', key: 'dia', width: 110 },
                        ]}
                      />
                    ),
                  },
                  {
                    key: 'three',
                    label: `Трёхжильные (${resistive?.three_core?.length ?? 0})`,
                    children: (
                      <Table
                        size="small"
                        loading={resistiveLoading}
                        dataSource={resistive?.three_core ?? []}
                        rowKey="model"
                        scroll={{ x: 'max-content' }}
                        pagination={{ pageSize: 20 }}
                        columns={[
                          { title: 'Марка', dataIndex: 'brand', key: 'brand', width: 100 },
                          { title: 'Модель', dataIndex: 'model', key: 'model', width: 180 },
                          { title: 'Размер', dataIndex: 'nominal_size_mm', key: 'size', width: 100 },
                          { title: 'Масса, кг/км', dataIndex: 'mass_kg_km', key: 'mass', width: 110 },
                          { title: 'Мин. R изгиба, мм', dataIndex: 'min_bend_radius_mm', key: 'bend', width: 140 },
                        ]}
                      />
                    ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'soil',
            label: `Грунты (${soil.length})`,
            children: (
              <Table
                size="small"
                loading={soilLoading}
                dataSource={soil}
                rowKey={(r) => `${r.soil_code}-${r.moisture_percent}`}
                pagination={false}
                columns={[
                  { title: 'Грунт', dataIndex: 'soil', key: 'soil' },
                  { title: 'Плотность, кг/м³', dataIndex: 'density_kg_m3', key: 'density', width: 150, render: (v) => v ?? '—' },
                  { title: 'Влажность, %', dataIndex: 'moisture_percent', key: 'moist', width: 120 },
                  { title: 'λ, Вт/(м·К)', dataIndex: 'conductivity', key: 'cond', width: 120, render: (v: number) => v.toFixed(2) },
                ]}
              />
            ),
          },
          {
            key: 'accessories',
            label: `Аксессуары (${accessories.length})`,
            children: (
              <Table
                size="small"
                loading={accLoading}
                dataSource={accessories}
                rowKey={(r) => `${r.category}-${r.name}`}
                pagination={false}
                columns={[
                  { title: 'Категория', dataIndex: 'category', key: 'category', width: 180, render: (v: string) => <TltBadge>{v}</TltBadge> },
                  { title: 'Наименование', dataIndex: 'name', key: 'name' },
                  { title: 'Артикул', dataIndex: 'article', key: 'article', width: 120, render: (v: string | null) => v ?? '—' },
                  { title: 'Ед.', dataIndex: 'unit', key: 'unit', width: 60 },
                  { title: 'На объект', dataIndex: 'per_object', key: 'per', width: 90 },
                ]}
              />
            ),
          },
        ]}
      />
    </TltCard>
  );
}
