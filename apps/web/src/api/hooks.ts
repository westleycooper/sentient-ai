/**
 * TanStack Query hooks for Sentinel API.
 *
 * Generated from packages/contracts/openapi.json via /regen-contracts.
 * DO NOT hand-edit this file — edit the domain and regenerate.
 *
 * Until codegen is wired up in CI these are hand-authored to match the FastAPI routes.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

// --- Types (mirror FastAPI DTOs) ---

export interface ReasoningStep {
  id: string;
  name: string;
  kind: "retrieve" | "reason" | "tool_call" | "summarise" | "guardrail_check";
  config: Record<string, unknown>;
  next_default: string | null;
  next_on: Record<string, string>;
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

export interface SmeTemplate {
  id: string;
  name: string;
  soul: string;
  steps: ReasoningStep[];
  sources: RetrievalSource[];
  rules: SmeRule[];
  is_default: boolean;
  visualisation_kind: "wave" | "wavecircle" | "wave3d" | "wave3dgrid";
  theme_id: string;
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
