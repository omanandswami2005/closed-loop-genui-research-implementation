// lab-ui/1: mirrors backend/closedloop_demo/widgets.py. Gemini writes these as JSON; the server validates them.

export interface StationBase {
  id: string;
  type: string;
  title: string;
  intro: string;
  goal: string;
  hints: string[];
  solution: string;
  explain: string;
}

export type Layout = "flow" | "layers" | "hub" | "cycle";
export interface Param { name: string; label: string; unit: string; min: number; max: number; step: number; value: number; answer: number }
export interface Slider { min: number; max: number; value: number; answer: number }
export interface Pt { x: number; y: number }

export interface SequenceSort extends StationBase { type: "SequenceSort"; items: string[] }
export interface CategorySort extends StationBase { type: "CategorySort"; categories: { name: string; items: string[] }[] }
export interface MatchPairs extends StationBase { type: "MatchPairs"; pairs: { left: string; right: string }[] }
export interface CycleBuilder extends StationBase { type: "CycleBuilder"; center: string; stages: string[] }
export interface Timeline extends StationBase { type: "Timeline"; unit: string; events: { label: string; value: number; display: string }[] }
export interface LabelDiagram extends StationBase { type: "LabelDiagram"; layout: Layout; center: string; parts: { label: string; clue: string }[] }
export interface BalanceScale extends StationBase { type: "BalanceScale"; unit: string; left: { label: string; value: number }[]; tray: { label: string; value: number }[]; answer: number[] }
export interface NumberLine extends StationBase { type: "NumberLine"; min: number; max: number; step: number; unit: string; markers: { label: string; value: number }[] }
export interface CauseEffect extends StationBase { type: "CauseEffect"; links: { cause: string; effect: string }[] }
export interface ClozeBank extends StationBase { type: "ClozeBank"; text: string; distractors: string[] }
export interface ProportionBar extends StationBase { type: "ProportionBar"; whole: string; segments: { label: string; value: number }[]; tolerance: number }
export interface ForceArrows extends StationBase {
  type: "ForceArrows";
  object: string;
  unit: string;
  step: number;
  forces: { label: string; direction: "left" | "right" | "up" | "down"; value: number; adjustable: boolean; max: number }[];
  target_x: number;
  target_y: number;
  answer: number[];
}
export interface Mixer extends StationBase { type: "Mixer"; product: string; ingredients: { label: string; unit: string; max: number; step: number; answer: number }[] }
export interface ToggleSystem extends StationBase { type: "ToggleSystem"; switches: string[]; outcomes: { on: string[]; result: string }[]; default_result: string; target_result: string }
export interface ExploreDiagram extends StationBase { type: "ExploreDiagram"; layout: Layout; center: string; parts: { label: string; detail: string }[] }

export interface ParameterLab extends StationBase { type: "ParameterLab"; expression: string; output_label: string; output_unit: string; params: Param[]; target: number; tolerance: number }
export interface FunctionPlot extends StationBase { type: "FunctionPlot"; expression: string; x_min: number; x_max: number; x_label: string; y_label: string; params: Param[] }
export interface Projectile extends StationBase { type: "Projectile"; speed: Slider; angle: Slider; gravity: number; target_distance: number; tolerance: number }
export interface Pendulum extends StationBase { type: "Pendulum"; length: Slider; gravity: number; target_period: number; tolerance: number }
export interface WaveExplorer extends StationBase { type: "WaveExplorer"; amplitude: Slider; frequency: Slider; phase: Slider; x_label: string; y_label: string }
export interface GrowthCurve extends StationBase {
  type: "GrowthCurve";
  model: "exponential" | "decay" | "logistic";
  start_value: number;
  capacity: number | null;
  rate: Slider;
  t_max: number;
  t_label: string;
  y_label: string;
  target_time: number;
  target_value: number;
}
export interface TrendLine extends StationBase { type: "TrendLine"; points: Pt[]; x_label: string; y_label: string }
export interface DataCursor extends StationBase { type: "DataCursor"; series: { label: string; points: Pt[] }[]; x_label: string; y_label: string; question: string; answer_x: number; tolerance: number }
export interface ProcessScrubber extends StationBase { type: "ProcessScrubber"; unit: string; stages: { label: string; duration: number; detail: string }[]; target_stage: string }
export interface PredictObserve extends StationBase { type: "PredictObserve"; setup: string; change: string; options: string[]; answer: string; observation: string; measure: { label: string; before: number; after: number } }
export interface ScenarioBranch extends StationBase { type: "ScenarioBranch"; steps: { situation: string; choices: { text: string; correct: boolean; feedback: string }[] }[] }
export interface SpotTheError extends StationBase { type: "SpotTheError"; statements: { text: string; wrong: boolean; correction: string }[] }
export interface ConceptMap extends StationBase { type: "ConceptMap"; nodes: string[]; edges: { source: string; target: string; label: string }[] }
export interface Flashcards extends StationBase { type: "Flashcards"; cards: { front: string; back: string }[] }
export interface DraggableBars extends StationBase { type: "DraggableBars"; unit: string; y_max: number; bars: { label: string; value: number }[]; tolerance: number }

export type Station =
  | SequenceSort | CategorySort | MatchPairs | CycleBuilder | Timeline | LabelDiagram | BalanceScale | NumberLine
  | CauseEffect | ClozeBank | ProportionBar | ForceArrows | Mixer | ToggleSystem | ExploreDiagram
  | ParameterLab | FunctionPlot | Projectile | Pendulum | WaveExplorer | GrowthCurve | TrendLine | DataCursor
  | ProcessScrubber | PredictObserve | ScenarioBranch | SpotTheError | ConceptMap | Flashcards | DraggableBars;

export interface Lab {
  schema_version: "lab-ui/1";
  title: string;
  intro: string;
  toolbox: string[];
  stations: Station[];
  source: "gemini" | "template" | "mixed";
  model: string;
  latency_ms: number;
  rejected: string[];
}

/** What a component tells its station after every change. */
export interface CheckState {
  ready: boolean; // enough done to check
  correct: boolean;
  feedback?: string; // shown when the check fails
  auto?: boolean; // component finishes itself (explore / flip / scenario): no Check button
}

export interface WidgetProps<T extends Station> {
  data: T;
  revealed: boolean; // show the solution state
  checked: number; // increments on every Check press (components may mark wrong parts)
  report: (s: CheckState) => void;
}
