type Callback = (info: Block, progress: number) => any;
type FilterCallback = (block: Block) => boolean;

type Block = {
  name: string;
  active: boolean;
  startTime: number;
  endTime: number;
  duration: number;
  callback?: Callback;
  completionCallback?: () => unknown; // TODO: use in updateblocks
  progress: number;
  progressChanged: boolean;
  context: unknown;
};

export default class Timeline {
  timeBlocks: Record<string, Block>;
  currentTime: number;
  duration: number;
  paused: boolean;
  completionCallback: null | (() => unknown);
  loopStartTime: null | number;
  loopEndTime: null | number;

  constructor() {
    this.timeBlocks = {};
    this.currentTime = 0;
    this.duration = 0;
    this.paused = false;
    this.completionCallback = null;
    this.loopStartTime = null;
    this.loopEndTime = null;
  }

  /**
   * Remove all ranges and go to beginning
   */
  reset() {
    this.removeAllRanges();
    this.goToBeginning();
  }

  /**
   * Updates timeline by adding delta time to the current time
   * @param dt - Deltatime
   */
  update(dt: number) {
    if (this.paused) return;

    let previousTime = this.currentTime;
    this.currentTime = Math.min(
      this.duration,
      Math.max(0.0, this.currentTime + dt),
    );
    this.#updateBlocks(previousTime);
  }

  /**
   * Updates timeline by looking at the current time
   * @param time - Current time
   */
  updateTime(time: number) {
    if (this.paused) return;

    let previousTime = this.currentTime;
    this.currentTime = Math.min(this.duration, Math.max(0.0, time));
    this.#updateBlocks(previousTime);
  }

  /**
   * Refactored function that is used in `update(dt)` or `updateTime(time)`
   * @param previousTime -
   */
  #updateBlocks(previousTime: number) {
    // loop back if looping enabled
    if (this.loopEndTime !== null && this.currentTime >= this.loopEndTime) {
      this.currentTime = this.loopStartTime!;
    }

    // Determine which blocks are at the current time and call their callback with the progress within that block of time.
    for (const [_, block] of Object.entries(this.timeBlocks)) {
      const previousBlockProgress = block.progress;
      if (
        this.currentTime >= block.startTime &&
        this.currentTime < block.endTime
      ) {
        const progress = (this.currentTime - block.startTime) / block.duration;
        block.progress = Math.max(Math.min(progress, 1.0), 0.0);
        block.active = true;
      } else if (this.currentTime >= block.endTime) {
        block.progress = 1.0;
        block.active = false;
      } else if (this.currentTime < block.startTime) {
        block.progress = 0.0;
        block.active = false;
      }
      block.progressChanged = previousBlockProgress !== block.progress;
      if (block.callback && block.progressChanged) {
        block.callback(block, block.progress);
      }
    }

    if (
      this.completionCallback &&
      this.currentTime !== previousTime &&
      this.currentTime >= this.duration
    ) {
      this.completionCallback();
    }
  }

  //===== Properties

  /**
   * @param callback - Function to call at completion
   */
  setCompletion(callback: () => unknown) {
    this.completionCallback = callback;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  isPaused() {
    return this.paused;
  }

  isAtBeginning() {
    return this.getProgress() === 0.0;
  }

  isAtEnd() {
    return this.getProgress() === 1.0;
  }

  /**
   * @returns Current time
   */
  getTime() {
    return this.currentTime;
  }

  /**
   * Get the progress of the whole timeline
   * @returns Value between 0..1
   */
  getProgress() {
    return Math.min(1.0, Math.max(0.0, this.currentTime / this.duration));
  }

  setLoopRange(startTime: number, endTime: number) {
    this.loopStartTime = startTime;
    this.loopEndTime = endTime;
  }

  /**
   * Reset `loopStartTime` and `loopEndTime` to `null`
   */
  removeLoopRange() {
    this.loopStartTime = null;
    this.loopEndTime = null;
  }

  //===== Seek

  /**
   * Update the current time to time argument
   * @param time - Time to go to
   */
  goToTime(time: number) {
    this.currentTime = time;
  }

  goToBeginning() {
    this.currentTime = 0.0;
  }

  /**
   * Update the current time to the end (duration)
   */
  goToEnd() {
    this.currentTime = this.duration;
  }

  /**
   * @returns total duration in seconds
   */
  getDuration() {
    return this.duration;
  }

  goToStartOfRange(name: string) {
    const timeRange = this.timeBlocks[name];

    if (timeRange !== null) {
      this.currentTime = timeRange.startTime;
    }

    return timeRange !== null;
  }

  goToNextRange(filterCallback: FilterCallback) {
    let nextTime = null;

    // Find the smallest start time greater than the current time
    for (const [_, block] of Object.entries(this.timeBlocks)) {
      if (block.startTime > this.currentTime) {
        if (nextTime === null || block.startTime < nextTime) {
          if (filterCallback === null || filterCallback(block) === true) {
            nextTime = block.startTime;
          }
        }
      }
    }

    // Only update currentTime if a next block is found
    if (nextTime !== null) {
      this.currentTime = nextTime;
    }

    return nextTime !== null;
  }

  goToPreviousRange(filterCallback: FilterCallback) {
    let previousTime = null;

    // Find the largest start time that is less than the current time
    for (const [_, block] of Object.entries(this.timeBlocks)) {
      if (
        block.startTime < this.currentTime &&
        this.currentTime >= block.endTime
      ) {
        if (previousTime === null || block.startTime > previousTime) {
          if (filterCallback === null || filterCallback(block) === true) {
            previousTime = block.startTime;
          }
        }
      }
    }

    // Only update currentTime if a previous block is found
    if (previousTime !== null) {
      this.currentTime = previousTime;
    }

    return previousTime !== null;
  }

  getRange(name: string) {
    return this.timeBlocks[name];
  }

  /**
   * Think of a range as a shot or a section of timeline. Each range has its own progress (normalized `t`) value,
   * so animation can be applied further down to control shapes and timings within the range.
   *
   * @param name - Name of range (internally called Block)
   * @param startTime - Start time of animation
   * @param duration - Duration of animation
   * @param callback - called with Block and progress information
   * @param context - ???
   * @returns New block object
   */
  addRange(
    name: string,
    startTime: number,
    duration: number,
    callback?: Callback,
    context?: unknown,
  ) {
    if (duration === 0.0) return null;

    const newBlock: Block = {
      name,
      active: false,
      startTime,
      endTime: startTime + duration,
      duration,
      callback,
      progress: 0.0,
      progressChanged: false,
      context,
    };

    this.timeBlocks[name] = newBlock;
    this.#recalculateDuration();

    return newBlock;
  }

  /**
   * Adds a new range to the end of the timeline. As it appends, no need to provide start time.
   *
   * @param name - Name of range (internally called `Block`)
   * @param duration - Duration of animation. It adds animation at the end of the previous duration
   * @param callback - called with Block and progress information
   * @param context - ???
   * @returns New block object
   */
  appendRange(
    name: string,
    duration: number,
    callback?: Callback,
    context?: unknown,
  ) {
    return this.addRange(name, this.getDuration(), duration, callback, context);
  }

  removeRange(name: string) {
    delete this.timeBlocks[name];
    this.#recalculateDuration();
  }

  removeAllRanges() {
    this.timeBlocks = {};
    this.#recalculateDuration();
  }

  /**
   * Get ranges at the given `time`. Blocks are returned if `time` is between their `startTime` and `endTime`.
   * @param time -
   * @param filterCallback - Optionally, pass the function to filter the ranges at time
   * @returns
   */
  getRangesAtTime(time: number, filterCallback?: FilterCallback) {
    const blocks: Record<string, Block> = {};

    for (const [_, block] of Object.entries(this.timeBlocks)) {
      if (time >= block.startTime && time < block.endTime) {
        if (filterCallback === undefined || filterCallback(block) === true) {
          blocks[block.name] = block;
        }
      }
    }

    return blocks;
  }

  /**
   * Get ranges at the current time.
   *
   * @param filterCallback - Optinally, pass the function to filter the ranges at current time
   * @returns
   */
  getCurrentRanges(filterCallback?: FilterCallback) {
    return this.getRangesAtTime(this.currentTime, filterCallback);
  }

  isRangeActive(name: string) {
    const r = this.timeBlocks[name];
    if (!r) return false;
    return r.active;
  }

  /**
   * Get the progress (0..1) of a range
   * @param name - Name of range
   * @returns between 0..1
   */
  getRangeProgress(name: string) {
    const r = this.timeBlocks[name];
    if (!r) return 0.0;
    return r.progress;
  }

  /**
   * Whenever there's a change in `timeBlocks`, this function gets called.
   */
  #recalculateDuration() {
    let totalDuration = 0;

    // which block has the maximum endTime
    for (const [_, block] of Object.entries(this.timeBlocks)) {
      totalDuration = Math.max(totalDuration, block.endTime);
    }

    this.duration = totalDuration;
  }

  //===== Debug

  print() {
    // Create an object to hold the time blocks for sorting
    const blocks: Record<string, Block> = {};
    for (const [_, block] of Object.entries(this.timeBlocks)) {
      blocks[block.name] = block;
    }

    // Sort the blocks by their start time
    const blocksArray = Object.entries(blocks).sort((a, b) => {
      return a[1].startTime - b[1].startTime;
    });

    // Print details of each block
    console.log(`${blocksArray.length} ranges in timeline`);
    for (const [_, block] of blocksArray) {
      console.log(block.name, block.progress, block.startTime, block.endTime);
    }
    console.log("\n");
  }
}
