"""LLM-backed execution of named guardrail checks (infrastructure layer)."""
from __future__ import annotations

import logging

from application.ports.llm_port import LLMPort

logger = logging.getLogger(__name__)

# Each entry: system prompt, user prompt template, rejection message shown to user.
_CHECKS: dict[str, dict[str, str]] = {
    "no_personal_advice_solicitation": {
        "system": "You are a compliance classifier. Reply with exactly one word on the first line: PASS or FAIL. Then on the next line give a brief reason.",
        "prompt": (
            "Does the following user message request personalised financial or investment advice "
            "(e.g. 'should I buy X?', 'is Y a good investment for me personally?')?\n\n"
            "Message: {text}\n\n"
            "PASS if it is a general information request. FAIL if it seeks personalised advice."
        ),
        "rejection": (
            "I can provide general market information but cannot give personalised investment advice. "
            "Please rephrase as a general question about the market or a company."
        ),
    },
    "no_personalised_advice": {
        "system": "You are a compliance classifier. Reply with exactly one word on the first line: PASS or FAIL. Then on the next line give a brief reason.",
        "prompt": (
            "Does the following response constitute personalised investment advice — "
            "for example telling a specific person to buy, sell, or hold particular assets?\n\n"
            "Response: {text}\n\n"
            "PASS if it is informational only. FAIL if it gives personal advice."
        ),
        "rejection": "I can only provide general market information, not personalised investment advice.",
    },
    "crisis_detection": {
        "system": "You are a safety classifier. Reply with exactly one word on the first line: PASS or FAIL. Then on the next line give a brief reason.",
        "prompt": (
            "Does the following message contain indicators of a mental health crisis — "
            "such as suicidal ideation, intent to self-harm, or immediate danger to self or others?\n\n"
            "Message: {text}\n\n"
            "PASS if no crisis indicators are present. FAIL if crisis indicators are present."
        ),
        "rejection": (
            "I'm concerned about what you've shared. If you are in immediate danger please contact emergency services (999 or 112). "
            "For mental health crisis support the Samaritans are available 24/7 on 116 123 (UK) or you can text SHOUT to 85258."
        ),
    },
    "no_harmful_content": {
        "system": "You are a safety classifier. Reply with exactly one word on the first line: PASS or FAIL. Then on the next line give a brief reason.",
        "prompt": (
            "Does the following response contain content that could harm a vulnerable person — "
            "for example encouraging self-harm, providing methods of harm, or dismissing genuine distress?\n\n"
            "Response: {text}\n\n"
            "PASS if safe. FAIL if potentially harmful."
        ),
        "rejection": (
            "I'm not able to provide that response. "
            "If you need support, please reach out to a qualified mental health professional or crisis service."
        ),
    },
    "no_protected_characteristics": {
        "system": "You are a fairness classifier. Reply with exactly one word on the first line: PASS or FAIL. Then on the next line give a brief reason.",
        "prompt": (
            "Does the following response make any inappropriate reference to protected characteristics "
            "such as age, gender, ethnicity, nationality, religion, disability, or sexual orientation?\n\n"
            "Response: {text}\n\n"
            "PASS if no inappropriate references. FAIL if protected characteristics are referenced inappropriately."
        ),
        "rejection": "I've adjusted my response to ensure it remains fair and free from bias.",
    },
    "constructive_tone": {
        "system": "You are a tone classifier. Reply with exactly one word on the first line: PASS or FAIL. Then on the next line give a brief reason.",
        "prompt": (
            "Is the following response constructive — framing feedback and advice positively "
            "and focusing on improvement rather than pure criticism?\n\n"
            "Response: {text}\n\n"
            "PASS if constructive. FAIL if predominantly negative or discouraging."
        ),
        "rejection": "Let me rephrase that more constructively.",
    },
    "no_profanity": {
        "system": "You are a content classifier. Reply with exactly one word on the first line: PASS or FAIL. Then on the next line give a brief reason.",
        "prompt": (
            "Does the following text contain profanity, hate speech, or abusive language?\n\n"
            "Text: {text}\n\n"
            "PASS if clean. FAIL if profanity or abuse is present."
        ),
        "rejection": "I'm sorry, I can't respond to messages containing abusive language. Please rephrase respectfully.",
    },
    "no_off_topic": {
        "system": "You are a relevance classifier. Reply with exactly one word on the first line: PASS or FAIL. Then on the next line give a brief reason.",
        "prompt": (
            "The assistant's area of expertise is: {soul}\n\n"
            "Is the following question clearly off-topic for this domain?\n\n"
            "Question: {text}\n\n"
            "PASS if on-topic or borderline. FAIL only if clearly unrelated."
        ),
        "rejection": "That question falls outside my area of expertise. I'm here to help within my designated domain.",
    },
}


async def run_guardrail(
    check_id: str,
    text: str,
    llm: LLMPort,
    *,
    soul: str = "",
    model: str,
) -> tuple[bool, str]:
    """
    Run a single named guardrail check.

    Returns (passed, rejection_message).
    passed=True means no issue found — processing should continue.
    On LLM error the check fails open (returns True) to avoid blocking the user.
    `model` is always a fully-resolved model string — the caller (graph.py)
    is responsible for the step → template-default → env-var fallback chain.
    """
    spec = _CHECKS.get(check_id)
    if spec is None:
        logger.warning("unknown_guardrail_check", extra={"check_id": check_id})
        return True, ""

    prompt = spec["prompt"].format(text=text, soul=soul)
    try:
        res = await llm.complete(system=spec["system"], prompt=prompt, model=model)
        first_line = res.text.strip().split("\n")[0].strip().upper()
        passed = first_line.startswith("PASS")
        return passed, "" if passed else spec["rejection"]
    except Exception:
        logger.exception("guardrail_executor_error", extra={"check_id": check_id})
        return True, ""  # fail open — don't block users on LLM errors
