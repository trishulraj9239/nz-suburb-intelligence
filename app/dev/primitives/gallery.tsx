import type { ReactNode } from "react";
import type { Status } from "@/lib/viz/status";
import { AGE_STAT, CENSUS_SERIES, ETHNICITY, FLOOD_STAT, RENT_SERIES, RENT_STAT, TENURE, TENURE_AKL, ageFmt, pctFmt, rentFmt } from "@/lib/viz/fixtures";
import { percentileLabel } from "@/lib/viz/format";
import { percentilePosition } from "@/lib/viz/scale";
import { BulletBar } from "@/components/viz/bullet-bar";
import { RangeBar } from "@/components/viz/range-bar";
import { Sparkline } from "@/components/viz/sparkline";
import { SlopeChart } from "@/components/viz/slope-chart";
import { Stacked100 } from "@/components/viz/stacked-100";
import { MultiBars } from "@/components/viz/multi-bars";
import { DecileStrip } from "@/components/viz/decile-strip";
import { LayerBullets } from "@/components/viz/layer-bullets";
import { DotPlot } from "@/components/viz/dot-plot";
import { DotStrip } from "@/components/viz/dot-strip";
import { Heatmap } from "@/components/viz/heatmap";
import { MetricRow } from "@/components/metric-row";
import { SectionCard } from "@/components/section-card";
import { ConfidenceLegend, SourceChip, StatusPill } from "@/components/source-chip";

const STATUSES: Status[] = ["exact", "est.", "approx", "computed", "suppressed", "unavailable"];
const REASON: Partial<Record<Status, string>> = { suppressed: "fewer than 5 bonds", unavailable: "service unreachable" };

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-hairline bg-surface p-3" data-block={title}>
      <h3 className="mb-2 font-display text-h3 font-semibold text-ink">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
function Case({ status, children }: { status: Status; children: ReactNode }) {
  return (
    <div data-case={status} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3">
      <span className="font-mono text-micro text-ink/55">{status}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Column() {
  const houseIcon = (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
  return (
    <div className="flex flex-col gap-4 bg-canvas p-3 text-ink">
      <Block title="Bullet bar — single value vs region (IQR track)">
        {STATUSES.map((s) => (
          <Case key={s} status={s}>
            <BulletBar label="Median rent" value={710} stat={RENT_STAT} format={rentFmt} judged status={s} reason={REASON[s]} />
          </Case>
        ))}
        <p className="font-mono text-micro text-ink/55">{rentFmt(710)} · {percentileLabel(percentilePosition(710, RENT_STAT))} · unjudged marker:</p>
        <BulletBar label="Median age" value={31.8} stat={AGE_STAT} format={ageFmt} status="exact" />
      </Block>

      <Block title="Range bar — LQ · median · UQ on the same axis">
        {(["exact", "est.", "suppressed"] as Status[]).map((s) => (
          <Case key={s} status={s}>
            <RangeBar label="Rent quartiles" lo={640} mid={710} hi={790} stat={RENT_STAT} format={rentFmt} judged status={s} reason={REASON[s]} />
          </Case>
        ))}
      </Block>

      <Block title="Sparkline — many points, end dot, mono delta">
        {(["exact", "est.", "unavailable"] as Status[]).map((s) => (
          <Case key={s} status={s}>
            <Sparkline label="Median rent series" points={RENT_SERIES} format={rentFmt} unit="$/week" deltaBack={4} judged status={s} reason={REASON[s]} />
          </Case>
        ))}
      </Block>

      <Block title="Slope chart — three censuses, straight segments">
        {(["exact", "approx", "suppressed"] as Status[]).map((s) => (
          <Case key={s} status={s}>
            <SlopeChart label="Population" points={CENSUS_SERIES} format={(v) => v.toLocaleString()} status={s} reason={REASON[s]} width={120} height={34} />
          </Case>
        ))}
      </Block>

      <Block title="Stacked 100% — fixed order + Auckland reference bar">
        {(["exact", "suppressed"] as Status[]).map((s) => (
          <Case key={s} status={s}>
            <Stacked100 label="Tenure" categories={TENURE} reference={TENURE_AKL} status={s} reason={REASON[s]} />
          </Case>
        ))}
      </Block>

      <Block title="Multi bars — multi-response, never stacked">
        {(["exact", "unavailable"] as Status[]).map((s) => (
          <Case key={s} status={s}>
            <MultiBars label="Ethnicity" rows={ETHNICITY} status={s} reason={REASON[s]} />
          </Case>
        ))}
      </Block>

      <Block title="Decile strip — one cell filled, ends labelled">
        {(["exact", "est.", "suppressed"] as Status[]).map((s) => (
          <Case key={s} status={s}>
            <DecileStrip label="NZDep2023 decile" value={3} lowLabel="least deprived" highLabel="most deprived" status={s} reason={REASON[s]} />
          </Case>
        ))}
      </Block>

      <Block title="Layer bullets — hazard count on the neutral ramp">
        <LayerBullets
          layers={[
            { label: "Flood plain (1% AEP)", value: 9.5, stat: FLOOD_STAT, format: pctFmt, status: "est.", vintage: "2026" },
            { label: "Coastal inundation (1% AEP)", value: 0, stat: { ...FLOOD_STAT, median: 1.2, p25: 0, p75: 4 }, format: pctFmt, status: "est.", vintage: "2025" },
            { label: "Overland flow paths", value: 22, stat: { ...FLOOD_STAT, median: 12, p25: 6, p75: 20, max: 45 }, format: pctFmt, status: "exact", vintage: "2026" },
            { label: "Liquefaction vulnerability", value: null, status: "suppressed", format: pctFmt, reason: "not assessed here", vintage: "2022" },
          ]}
        />
      </Block>

      <Block title="Dot plot — destinations × modes on 0–120 min">
        <DotPlot
          rows={[
            { label: "Auckland CBD", dots: [{ mode: "drive", min: 14, status: "est.", medianMin: 32 }, { mode: "cycle", min: 28, status: "est.", medianMin: 55 }, { mode: "walk", min: 78, status: "est.", medianMin: 110 }] },
            { label: "Auckland Airport", dots: [{ mode: "drive", min: 34, status: "est.", medianMin: 38 }, { mode: "cycle", min: 95, status: "est." }, { mode: "walk", min: 240, status: "est." }] },
            { label: "Work", sublabel: "12 Madden Street, Wynyard Quarter", tag: "your anchor", dots: [{ mode: "drive", min: 18, status: "computed" }] },
            { label: "School drop-off", status: "unavailable", reason: "not set — add it in Places", dots: [] },
          ]}
        />
      </Block>

      <Block title="Dot strip — compare three suburbs on one axis">
        {(["exact", "est.", "unavailable"] as Status[]).map((s) => (
          <Case key={s} status={s}>
            <DotStrip
              label="Median rent"
              stat={RENT_STAT}
              format={rentFmt}
              status={s}
              reason={REASON[s]}
              dots={[
                { id: "a", name: "Takapuna Central", initial: "T", value: 760, status: "exact" },
                { id: "b", name: "Milford West", initial: "M", value: 690, status: "est.", best: true },
                { id: "c", name: "Chatswood", initial: "C", value: 825, status: "exact" },
              ]}
            />
          </Case>
        ))}
      </Block>

      <Block title="Heatmap — percentile overview, higher-is-better only">
        <Heatmap
          columns={[
            { id: "a", name: "Takapuna Central", initial: "T" },
            { id: "b", name: "Milford West", initial: "M" },
            { id: "c", name: "Chatswood", initial: "C" },
          ]}
          rows={[
            { label: "Median household income", cells: [{ id: "a", pct: 71 }, { id: "b", pct: 84 }, { id: "c", pct: 92 }] },
            { label: "Consenting rate", cells: [{ id: "a", pct: 40 }, { id: "b", pct: null }, { id: "c", pct: 18 }] },
            { label: "Drive to CBD", cells: [{ id: "a", pct: 88 }, { id: "b", pct: 80 }, { id: "c", pct: 66 }] },
          ]}
        />
      </Block>

      <Block title="Chips, pills and the legend">
        <div className="flex flex-wrap gap-3">
          <SourceChip source="Tenancy bond data (quarterly, SA2)" asOf="2026-04-01" quality="exact" />
          <SourceChip source="Stats NZ Census 2023" asOf="2023-03-07" quality="est." />
          <SourceChip source="Auckland Council open data" asOf="2026-09-25" quality="approx" geometry="address point" />
          <SourceChip source="LINZ Property Boundaries" asOf="2026-09-28" quality="exact" geometry="rating unit" />
          <SourceChip source="openrouteservice" asOf="2026-09-28" quality="computed" />
          <SourceChip source="Stats NZ Census 2023" asOf="2023-03-07" quality="suppressed" geometry="SA1 block" />
        </div>
        <div className="flex flex-wrap gap-3">
          <StatusPill status="inside" text="inside" />
          <StatusPill status="within" text="within 20 m" />
          <StatusPill status="outside" text="outside" />
          <StatusPill status="clear" text="none within 20 m" />
          <StatusPill status="not assessed" text="not in the assessed area" />
          <StatusPill status="unavailable" text="council service unavailable — not checked" />
          <StatusPill status="pending" text="checking… (slow council layer)" />
        </div>
        <ConfidenceLegend />
      </Block>

      <SectionCard
        id="housing-demo"
        title="Housing"
        icon={houseIcon}
        accent="housing"
        headline="Rent 72nd percentile of Auckland"
        chip={<SourceChip source="Tenancy bond data (quarterly, SA2)" asOf="2026-04-01" quality="exact" />}
        srTable={{ head: ["Metric", "Value", "Auckland median"], rows: [["Median rent", "$710/wk", "$650/wk"], ["Rent quartiles", "$640–$790/wk", "$650/wk"]] }}
      >
        <MetricRow label="Median rent (new tenancies)" value={rentFmt(710)} viz={<BulletBar label="Median rent" value={710} stat={RENT_STAT} format={rentFmt} judged status="exact" />} note={percentileLabel(72)} />
        <MetricRow label="Rent quartiles" value="$640–$790" viz={<RangeBar label="Rent quartiles" lo={640} mid={710} hi={790} stat={RENT_STAT} format={rentFmt} judged status="exact" />} />
        <MetricRow label="Rent, 12 months" value="+$50/wk" viz={<Sparkline label="Median rent series" points={RENT_SERIES} format={rentFmt} unit="$/week" deltaBack={4} judged status="exact" />} secondary={false} />
        <MetricRow label="Damp (self-reported)" value="—" viz={<BulletBar label="Damp" value={0} stat={FLOOD_STAT} format={pctFmt} status="suppressed" reason="fewer than 30 dwellings" />} />
        <MetricRow label="Median rent, 2023 census" value="$620/wk" secondary chip={<SourceChip source="Stats NZ Census 2023" asOf="2023-03-07" quality="est." />} />
      </SectionCard>
    </div>
  );
}

export function Gallery() {
  return (
    <main className="min-h-dvh bg-canvas p-3 text-ink">
      <h1 className="mb-1 font-display text-h2 font-bold">Primitives gallery</h1>
      <p className="mb-3 text-body text-ink/70">Every primitive × every status, light and dark side by side. Dev only.</p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div data-theme="light" data-gallery-theme="light" className="rounded-card border border-hairline">
          <Column />
        </div>
        <div data-theme="dark" data-gallery-theme="dark" className="rounded-card border border-hairline">
          <Column />
        </div>
      </div>
    </main>
  );
}
