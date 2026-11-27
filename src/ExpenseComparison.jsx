import { useId, useMemo, useState } from 'react';
import { EXPENSE_CATEGORIES, summarizeTripExpenses } from './expenseOverview.js';
import './expense-parity.css';

const krw = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' });
const formatAmount = amount => amount === null ? '—' : krw.format(amount);
const hasOnlyUnknownAmounts = summary => summary.recordedCount === 0 && summary.excludedCount > 0;

function TripPicker({ label, trip, otherTrip, options, onChange }) {
  return (
    <label className="expense-comparison__picker">
      <span>{label}</span>
      <select value={trip.id} onChange={event => onChange(event.target.value)}>
        {options.map(option => (
          <option key={option.id} value={option.id} disabled={option.id === otherTrip.id}>
            {option.name}{option.trip.startDate ? ` · ${option.trip.startDate}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function ComparisonRows({ title, rows }) {
  if (rows.length === 0) return null;
  return (
    <tbody>
      <tr className="expense-comparison__group">
        <th scope="rowgroup" colSpan={3}>{title}</th>
      </tr>
      {rows.map(({ key, label, amounts }) => (
        <tr key={key}>
          <th scope="row">{label}</th>
          {amounts.map((amount, index) => <td key={index}>{formatAmount(amount)}</td>)}
        </tr>
      ))}
    </tbody>
  );
}

export function ExpenseComparison({ trips = [], activeTripId } = {}) {
  const titleId = useId();
  const explanationId = useId();
  const [selection, setSelection] = useState({ first: '', second: '' });
  const choices = useMemo(() => {
    const byId = new Map();
    for (const trip of Array.isArray(trips) ? trips : []) {
      const id = String(trip?.id ?? '');
      if (!id || byId.has(id)) continue;
      byId.set(id, { id, name: String(trip.name ?? '').trim() || '이름 없는 여행', trip });
    }
    return byId;
  }, [trips]);
  const options = [...choices.values()];
  const selectedSecond = choices.get(selection.second);
  const defaultFirst = choices.get(String(activeTripId ?? ''));
  const first = choices.get(selection.first)
    ?? (defaultFirst && defaultFirst !== selectedSecond ? defaultFirst : options.find(option => option !== selectedSecond));
  const second = selectedSecond && selectedSecond !== first ? selectedSecond : options.find(option => option !== first);
  const firstSummary = useMemo(() => summarizeTripExpenses(first?.trip), [first]);
  const secondSummary = useMemo(() => summarizeTripExpenses(second?.trip), [second]);

  if (!first || !second) {
    return (
      <section className="expense-comparison" aria-labelledby={titleId}>
        <h3 id={titleId}>여행별 지출 비교</h3>
        <p>여행이 두 개 이상이면 지출을 비교할 수 있어요.</p>
      </section>
    );
  }

  const selectedTrips = [first, second];
  const summaries = [firstSummary, secondSummary];
  const amountsFor = getAmount => summaries.map(summary => hasOnlyUnknownAmounts(summary) ? null : getAmount(summary));
  const days = [...new Set(summaries.flatMap(summary => Object.keys(summary.byDay).map(Number)))].sort((a, b) => a - b);
  const dailyRows = days.map(day => ({
    key: day,
    label: day === 0 ? '여행 전 준비' : `${day}일차`,
    amounts: amountsFor(summary => day <= summary.dayCount ? summary.byDay[day] ?? 0 : null)
  }));
  const categoryRows = EXPENSE_CATEGORIES.filter(({ value }) => summaries.some(summary => Object.hasOwn(summary.byCategory, value)))
    .map(({ value, label, emoji }) => ({
      key: value,
      label: <><span aria-hidden="true">{emoji} </span>{label}</>,
      amounts: amountsFor(summary => summary.byCategory[value] ?? 0)
    }));

  return (
    <section className="expense-comparison" aria-labelledby={titleId}>
      <h3 id={titleId}>여행별 지출 비교</h3>
      <p id={explanationId}>저장된 원화 환산액 기준이에요. 여행 전 준비 지출은 총 지출에 포함되며 일평균에서 제외돼요.</p>

      <div className="expense-comparison__pickers">
        <TripPicker label="첫 번째 여행" trip={first} otherTrip={second} options={options}
          onChange={id => setSelection({ first: id, second: second.id })} />
        <TripPicker label="두 번째 여행" trip={second} otherTrip={first} options={options}
          onChange={id => setSelection({ first: first.id, second: id })} />
      </div>

      <table className="expense-comparison__table" aria-labelledby={titleId} aria-describedby={explanationId}>
        <colgroup><col className="expense-comparison__label-column" /><col /><col /></colgroup>
        <thead>
          <tr>
            <th scope="col">지출 항목</th>
            {selectedTrips.map(({ id, name }, index) => (
              <th scope="col" key={id}>
                {name}
                <small>{summaries[index].dayCount > 0 ? `${summaries[index].dayCount}일` : '기간 미정'}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="expense-comparison__summary">
          <tr><th scope="row">총 지출</th>{amountsFor(summary => summary.totalKRW).map((amount, index) => <td key={index}>{formatAmount(amount)}</td>)}</tr>
          <tr><th scope="row">여행 중 일평균</th>{amountsFor(summary => summary.averageDailyKRW).map((amount, index) => <td key={index}>{formatAmount(amount)}</td>)}</tr>
        </tbody>
        <ComparisonRows title="일차별 지출" rows={dailyRows} />
        <ComparisonRows title="카테고리별 지출" rows={categoryRows} />
      </table>

      {selectedTrips.map(({ id, name }, index) => {
        const { recordedCount, excludedCount } = summaries[index];
        if (excludedCount > 0) return <p key={id} className="expense-comparison__notice">{name}의 환율 미확인 지출 {excludedCount}건을 제외했어요.</p>;
        if (recordedCount === 0) return <p key={id}>{name}의 지출 내역이 없어요.</p>;
        return null;
      })}
    </section>
  );
}

export default ExpenseComparison;
