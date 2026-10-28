// One AudioContext for previewing sounds and voices on the dashboard, made on first use (after a click).
let context: AudioContext | null = null;
export const previewAudio = () => (context ??= new AudioContext());
