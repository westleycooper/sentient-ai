import "@testing-library/jest-dom";

// jsdom doesn't implement scrollIntoView; several components call it on mount
// (e.g. TranscriptDrawer auto-scrolling to the latest message).
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
