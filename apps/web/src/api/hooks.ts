/**
 * TanStack Query hooks for Sentient AI API.
 *
 * Generated from packages/contracts/openapi.json via /regen-contracts.
 * DO NOT hand-edit this file — edit the domain and regenerate.
 *
 * Until codegen is wired up in CI these are hand-authored to match the FastAPI routes.
 */
import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, streamEvents } from "./client";

// --- Types (mirror FastAPI DTOs) ---

export interface ReasoningStep {
  id: string;
  name: string;
  kind: "retrieve" | "reason" | "tool_call" | "summarise" | "guardrail_check";
  config: Record<string, unknown>;
  next_default: string | null;
  next_on: Record<string, string>;
  /** Namespaced model id (e.g. "openai:gpt-5.6-terra") overriding the template
   * default for this step. Only used when the template's `use_step_models` is on. */
  model?: string | null;
}

export interface RetrievalSource {
  id: string;
  name: string;
  kind: "http_api" | "json_set";
  config: Record<string, unknown>;
}

export interface SmeRule {
  id: string;
  description: string;
  enabled: boolean;
}

export interface LessonQuestion {
  id: string;
  title: string;
  question: string;
  answer: string;
  image_url: string | null;
}

export interface LessonConfig {
  enabled: boolean;
  visual_verify: boolean;
  questions: LessonQuestion[];
}

export interface SmeTemplate {
  id: string;
  name: string;
  soul: string;
  steps: ReasoningStep[];
  sources: RetrievalSource[];
  rules: SmeRule[];
  is_default: boolean;
  visualisation_kind: "wave" | "wavecircle" | "wave3d" | "wave3dgrid" | "wavehead";
  theme_id: string;
  lesson: LessonConfig;
  /** Namespaced model id (e.g. "anthropic:claude-sonnet-5") used for every
   * LLM-calling step unless `use_step_models` is on and a step overrides it.
   * `null` defers to the platform's zero-config default. */
  default_model?: string | null;
  /** When true, individual steps may use their own `model` instead of `default_model`. */
  use_step_models: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  token_count: number;
  citations: Record<string, unknown>[];
}

export interface Conversation {
  id: string;
  sme_id: string;
  created_at: string;
  messages: Message[];
}

export interface StartConversationResponse {
  conversation_id: string;
  sme_id: string;
  created_at: string;
}

// --- SSE event shapes ---

export interface StepEvent {
  type: "step";
  step_id: string;
  step_name: string;
  phase: string;
  latency_ms: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model: string | null;
  estimated_cost: number;
  output_preview: string | null;
}

export interface CompleteEvent {
  type: "complete";
  answer: string;
  total_tokens: number;
  citations: Record<string, unknown>[];
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export interface TranscriptEvent {
  type: "transcript";
  text: string;
}

export type TurnEvent = TranscriptEvent | StepEvent | CompleteEvent | ErrorEvent;

// --- SME hooks ---

export function useSmeTemplates() {
  return useQuery<SmeTemplate[]>({
    queryKey: ["sme", "templates"],
    queryFn: () => api.get<SmeTemplate[]>("/sme"),
  });
}

export function useSmeTemplate(id: string) {
  return useQuery<SmeTemplate>({
    queryKey: ["sme", "templates", id],
    queryFn: () => api.get<SmeTemplate>(`/sme/${id}`),
    enabled: Boolean(id),
  });
}

export function useSaveSmeTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["sme", "save"],
    mutationFn: (template: SmeTemplate) =>
      api.put<SmeTemplate>(`/sme/${template.id}`, template),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sme"] }),
  });
}

export function useDeleteSmeTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["sme", "delete"],
    mutationFn: (id: string) => api.delete(`/sme/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sme"] }),
  });
}

// --- Model selection (ADR-0005) ---

export interface FrontierModelOption {
  id: string;
  provider: string;
  label: string;
  description: string;
}

export interface RecommendedModelOption {
  tag: string;
  label: string;
  description: string;
}

export interface LocalModelInfo {
  id: string;
  name: string;
  size_bytes: number;
  modified_at: string;
}

export interface LocalModelBrowserState {
  runtime_available: boolean;
  base_url: string;
  installed: LocalModelInfo[];
  recommended: RecommendedModelOption[];
}

export interface PullProgressFrame {
  type: "progress" | "complete" | "error";
  status?: string;
  digest?: string | null;
  completed?: number | null;
  total?: number | null;
  model_tag?: string;
  message?: string;
}

export function useFrontierModels() {
  return useQuery<FrontierModelOption[]>({
    queryKey: ["models", "frontier"],
    queryFn: () => api.get<FrontierModelOption[]>("/models/frontier"),
  });
}

export function useLocalModelBrowser() {
  return useQuery<LocalModelBrowserState>({
    queryKey: ["models", "local"],
    queryFn: () => api.get<LocalModelBrowserState>("/models/local"),
  });
}

export function useDeleteLocalModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["models", "local", "delete"],
    mutationFn: (tag: string) => api.delete(`/models/local/${encodeURIComponent(tag)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models", "local"] }),
  });
}

/** Pulls (downloads) a local model, streaming progress over SSE. Not a
 * TanStack mutation — `/models/local/pull` is a long-lived stream, not a
 * single request/response, so this builds directly on `streamEvents`. */
export function usePullLocalModel() {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<PullProgressFrame | null>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const pull = useCallback(
    (modelTag: string) => {
      setIsPulling(true);
      setProgress(null);
      setError(null);
      cleanupRef.current = streamEvents(
        "/models/local/pull",
        { model_tag: modelTag },
        (raw) => {
          const frame = raw as PullProgressFrame;
          setProgress(frame);
          if (frame.type === "complete") {
            setIsPulling(false);
            qc.invalidateQueries({ queryKey: ["models", "local"] });
          } else if (frame.type === "error") {
            setIsPulling(false);
            setError(frame.message ?? "Pull failed");
          }
        },
        (err) => {
          setIsPulling(false);
          setError(err.message);
        }
      );
    },
    [qc]
  );

  return { pull, progress, isPulling, error };
}

// --- Agent Config types ---

export interface AgentModel {
  id: string;
  label: string;
  description: string;
}

export interface AgentConfig {
  model: string;
  working_mode: "full" | "frontend_only";
  system_prompt: string;
  auto_allow_tools: string[];
  /** Behavioural guardrails — enforced on every response via system prompt. */
  rules: SmeRule[];
  /** Retrieval sources for per-turn context injection. */
  sources: RetrievalSource[];
  theme_id: string;
}

// --- Agent Config hooks ---

export function useAgentModels() {
  return useQuery<AgentModel[]>({
    queryKey: ["agent", "models"],
    queryFn: () => api.get<AgentModel[]>("/agent/models"),
  });
}

export function useAgentConfig() {
  return useQuery<AgentConfig>({
    queryKey: ["agent", "config"],
    queryFn: () => api.get<AgentConfig>("/agent/config"),
  });
}

export function useUpdateAgentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["agent", "config", "save"],
    mutationFn: (config: AgentConfig) => api.put<AgentConfig>("/agent/config", config),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent", "config"] }),
  });
}

// --- Conversation hooks ---

export function useConversation(conversationId: string | null) {
  return useQuery<Conversation>({
    queryKey: ["conversations", conversationId],
    queryFn: () => api.get<Conversation>(`/conversations/${conversationId}`),
    enabled: Boolean(conversationId),
  });
}

export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["conversations", "start"],
    mutationFn: (smeId: string) =>
      api.post<StartConversationResponse>("/conversations", { sme_id: smeId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

// --- MCP status (ADR-0004) ---

export interface McpResourceInfo {
  uri_template: string;
  name: string;
  description: string;
  wraps: string;
  /** {param} names parsed from uri_template — MCP resource templates carry no richer schema than this. */
  params: string[];
}

export interface McpJsonSchemaProperty {
  type?: string;
  title?: string;
  default?: unknown;
}

export interface McpToolInputSchema {
  properties: Record<string, McpJsonSchemaProperty>;
  required?: string[];
}

export interface McpToolInfo {
  name: string;
  description: string;
  wraps: string;
  /** Real JSON Schema from the mcp SDK's list_tools() — drives the explorer's form. */
  input_schema: McpToolInputSchema;
}

export interface McpStatus {
  mounted: boolean;
  mount_path: string;
  resources: McpResourceInfo[];
  tools: McpToolInfo[];
  sme_template_count: number;
  conversations_touched_count: number;
}

export function useMcpStatus() {
  return useQuery<McpStatus>({
    queryKey: ["mcp", "status"],
    queryFn: () => api.get<McpStatus>("/mcp-status"),
    refetchInterval: 15000,
  });
}

// --- MCP interactive explorer (ADR-0004 addendum) ---

export interface McpInteractResult {
  content: unknown;
}

export function useReadMcpResource() {
  return useMutation({
    mutationKey: ["mcp", "read-resource"],
    mutationFn: (uri: string) =>
      api.post<McpInteractResult>("/mcp-status/resources/read", { uri }),
  });
}

export function useCallMcpTool() {
  return useMutation({
    mutationKey: ["mcp", "call-tool"],
    mutationFn: ({ name, arguments: args }: { name: string; arguments: Record<string, unknown> }) =>
      api.post<McpInteractResult>("/mcp-status/tools/call", { name, arguments: args }),
  });
}
