// Mirrors backend/closedloop_demo (schema "learn-ui/1" and the /api/demo payloads).
import type { Telemetry } from "../types";

export interface Profile {
  name: string;
  grade: string;
  interests: string;
  prior: "new" | "little" | "well";
  goal: string;
}

export interface TopicSummary {
  id: string;
  title: string;
  summary: string;
  key_points: string[];
  questions: number;
}

export interface PackSummary {
  id: string;
  title: string;
  source_name: string;
  source_kind: string;
  source_units: number;
  chars: number;
  truncated: boolean;
  seeded: boolean;
  model: string;
  created: string;
  generation_ms: number;
  dropped_questions: number;
  topics: TopicSummary[];
  cached?: boolean;
}

export interface StackNode {
  type: "Stack";
  direction: "vertical" | "horizontal";
  children: LearnNode[];
}
export interface PromptNode {
  type: "Prompt";
  text: string;
}
export interface ConceptCardNode {
  type: "ConceptCard";
  title: string;
  points: string[];
  highlight: number | null;
}
export interface WorkedExplanationNode {
  type: "WorkedExplanation";
  steps: { label: string; text: string }[];
}
export interface HintAccordionNode {
  type: "HintAccordion";
  hints: string[];
}
export interface ChoiceQuestionNode {
  type: "ChoiceQuestion";
  question_id: string;
  style: "guided" | "plain" | "apply";
  options_shown: number;
  justify: boolean;
  evidence: number;
  key_idea?: string | null;
}
export interface BlankQuestionNode {
  type: "BlankQuestion";
  question_id: string;
  word_bank: number;
}
export type LearnNode =
  | StackNode
  | PromptNode
  | ConceptCardNode
  | WorkedExplanationNode
  | HintAccordionNode
  | ChoiceQuestionNode
  | BlankQuestionNode;

export interface LearnDocument {
  schema_version: "learn-ui/1";
  question_id: string;
  root: LearnNode;
}

export interface QuestionView {
  id: string;
  kind: "choice" | "blank";
  level: number;
  prompt: string;
  options?: string[];
  evidence?: string[];
  word_bank?: string[];
}

export interface Outcome {
  correct: boolean;
  message: string;
  correct_answer: string;
  explanation: string;
  prompt: string;
}

export interface DemoView {
  session_id: string;
  pack_id: string;
  topic: { id: string; title: string; summary: string };
  item: number;
  question: QuestionView;
  level_name: string;
  document: LearnDocument;
  telemetry: Telemetry;
  history: Telemetry[];
  responses: boolean[];
  setpoint: number;
  plant: "gemini" | "deterministic";
  notice: string | null;
  outcome: Outcome | null;
  stage: "explore" | "check" | "done";
  done: boolean;
  end_reason: string | null;
  answered: number;
  max_items: number;
  lab_results: Record<string, { type: string; solved: boolean; attempts: number; revealed: boolean; seconds: number }>;
}

export interface TopicReport {
  pack_id: string;
  pack_title: string;
  topic_id: string;
  topic_title: string;
  session_id: string;
  answered: number;
  correct: number;
  accuracy: number | null;
  mastery_start: number;
  mastery_now: number;
  highest_level: number | null;
  levels_seen: number[];
  hints_opened: number;
  minutes: number;
  gemini_screens: number;
  fallback_screens: number;
  template_screens?: number;
  status: "mastered" | "in progress" | "needs support" | "not started";
  advice: string;
  trace: number[];
  stage?: "explore" | "check" | "done";
  end_reason?: string | null;
  lab?: { stations: number; solved: number; first_try: number; components: string[] };
  missed: { prompt: string; your_answer: string; correct_answer: string; explanation: string; level: number }[];
}

export interface LearnerReport {
  learner_id: string;
  profile: Profile;
  topics: TopicReport[];
  totals: { topics_started: number; topics_mastered: number; answered: number; correct: number };
}
