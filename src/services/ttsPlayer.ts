export interface TTSPlayer {
  play(text: string): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  // Placeholder for synced highlighting logic
}

export const createTTSPlayer = (): TTSPlayer => {
  return {
    play: async (text: string): Promise<void> => {
      console.log('Playing:', text);
    },
    pause: () => {
      console.log('Paused');
    },
    resume: () => {
      console.log('Resumed');
    },
    stop: () => {
      console.log('Stopped');
    },
  };
};
