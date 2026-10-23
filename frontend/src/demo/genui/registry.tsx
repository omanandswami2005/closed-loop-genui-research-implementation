// lab-ui/1 type -> React component. The renderer is fixed; Gemini only picks types and fills their props.
import type { ComponentType } from "react";
import type { Station, WidgetProps } from "./types";
import * as H from "./widgets/handsOn";
import * as S from "./widgets/sims";

type AnyWidget = ComponentType<WidgetProps<Station>>;

export const REGISTRY: Record<Station["type"], AnyWidget> = {
  SequenceSort: H.SequenceSortW as AnyWidget,
  CategorySort: H.CategorySortW as AnyWidget,
  MatchPairs: H.MatchPairsW as AnyWidget,
  CycleBuilder: H.CycleBuilderW as AnyWidget,
  Timeline: H.TimelineW as AnyWidget,
  LabelDiagram: H.LabelDiagramW as AnyWidget,
  BalanceScale: H.BalanceScaleW as AnyWidget,
  NumberLine: H.NumberLineW as AnyWidget,
  CauseEffect: H.CauseEffectW as AnyWidget,
  ClozeBank: H.ClozeBankW as AnyWidget,
  ProportionBar: H.ProportionBarW as AnyWidget,
  ForceArrows: H.ForceArrowsW as AnyWidget,
  Mixer: H.MixerW as AnyWidget,
  ToggleSystem: H.ToggleSystemW as AnyWidget,
  ExploreDiagram: H.ExploreDiagramW as AnyWidget,
  ParameterLab: S.ParameterLabW as AnyWidget,
  FunctionPlot: S.FunctionPlotW as AnyWidget,
  Projectile: S.ProjectileW as AnyWidget,
  Pendulum: S.PendulumW as AnyWidget,
  WaveExplorer: S.WaveExplorerW as AnyWidget,
  GrowthCurve: S.GrowthCurveW as AnyWidget,
  TrendLine: S.TrendLineW as AnyWidget,
  DataCursor: S.DataCursorW as AnyWidget,
  ProcessScrubber: S.ProcessScrubberW as AnyWidget,
  PredictObserve: S.PredictObserveW as AnyWidget,
  ScenarioBranch: S.ScenarioBranchW as AnyWidget,
  SpotTheError: S.SpotTheErrorW as AnyWidget,
  ConceptMap: S.ConceptMapW as AnyWidget,
  Flashcards: S.FlashcardsW as AnyWidget,
  DraggableBars: S.DraggableBarsW as AnyWidget,
};

const SIMS = new Set(["ParameterLab", "FunctionPlot", "Projectile", "Pendulum", "WaveExplorer", "GrowthCurve", "TrendLine", "DataCursor", "ProcessScrubber", "PredictObserve", "ScenarioBranch", "SpotTheError", "ConceptMap", "Flashcards", "DraggableBars"]);

export const family = (type: string) => (SIMS.has(type) ? "simulation" : "hands-on");

/** "ParameterLab" -> "Parameter lab" */
export const prettyType = (type: string) => type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/ (\w)/g, (_, c: string) => ` ${c.toLowerCase()}`);
