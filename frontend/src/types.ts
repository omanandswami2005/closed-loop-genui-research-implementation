// Mirrors backend/closedloop/ast_schema.py (CLT-UI, schema "clt-ui/1").

export interface LinearExpr {
  coef_x: number;
  const: number;
}

export interface Equation {
  a: number;
  b: number;
  c: number;
}

export interface StackNode {
  type: "Stack";
  direction: "vertical" | "horizontal";
  children: CltNode[];
}

export interface MathTextNode {
  type: "MathText";
  latex: string;
}

export interface ConcreteBalanceScaleNode {
  type: "ConcreteBalanceScale";
  left: LinearExpr;
  right: LinearExpr;
  draggable_weights: number;
}

export interface WorkedStep {
  operation: string;
  result_latex: string;
  explanation: string;
}

export interface WorkedSolutionStepNode {
  type: "WorkedSolutionStep";
  steps: WorkedStep[];
}

export type Operation = "+" | "-" | "*" | "/";

export interface ScaffoldedOperationPadNode {
  type: "ScaffoldedOperationPad";
  operations: Operation[];
  value_input: boolean;
}

export interface SymbolicEquationWorkspaceNode {
  type: "SymbolicEquationWorkspace";
  input_lines: number;
}

export interface SteppedHintAccordionNode {
  type: "SteppedHintAccordion";
  hints: string[];
}

export interface LineSpec {
  slope: number;
  intercept: number;
}

export interface CartesianVerificationPlaneNode {
  type: "CartesianVerificationPlane";
  lines: LineSpec[];
  draggable: boolean;
  parameter_sliders: number;
}

export type CltNode =
  | StackNode
  | MathTextNode
  | ConcreteBalanceScaleNode
  | WorkedSolutionStepNode
  | ScaffoldedOperationPadNode
  | SymbolicEquationWorkspaceNode
  | SteppedHintAccordionNode
  | CartesianVerificationPlaneNode;

export interface UIDocument {
  schema_version: "clt-ui/1";
  equation: Equation;
  root: CltNode;
}

export interface Decision {
  scaffolding_mode: "worked_example" | "guided_scaffold" | "open_symbolic";
  show_balance_scale: boolean;
  hint_enabled: boolean;
  density_limit: number;
  graph_verification: boolean;
  alpha: number;
}

export interface Telemetry {
  item: number;
  mastery: number;
  error: number;
  integral: number;
  derivative: number;
  effort: number;
  budget_raw: number;
  budget: number;
  level: number;
  m_i: number;
  rho: number;
  alpha: number;
  delta: number;
  abs_error: number;
  decision: Decision;
  plant: string;
  plant_ms: number;
  system1_ms: number;
  schema_valid: boolean;
  within_budget: boolean;
  fallback_used: boolean;
  reason: string | null;
  lapse_alarms: number;
}

export interface StepCheck {
  parsed: boolean;
  equivalent: boolean;
  solved: boolean;
  message: string;
}

export interface Outcome {
  correct: boolean;
  message: string;
  solution: string;
  steps: (StepCheck & { line: string })[];
}

export interface SessionView {
  session_id: string;
  item: number;
  equation: Equation;
  equation_latex: string;
  document: UIDocument;
  telemetry: Telemetry;
  history: Telemetry[];
  responses: boolean[];
  setpoint: number;
  outcome?: Outcome;
}

export type PlantName = "surrogate" | "gemini";
