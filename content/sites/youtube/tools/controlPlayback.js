// content/sites/youtube/tools/controlPlayback.js — Control video playback

const ControlPlaybackTool = {
  name: 'control_playback',
  description: 'Control YouTube video playback: play, pause, seek to a timestamp, adjust volume, change speed, or toggle fullscreen.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['play', 'pause', 'seek', 'volume', 'speed', 'fullscreen', 'mute', 'unmute'],
        description: 'The playback action to perform.'
      },
      value: {
        type: 'string',
        description: 'Value for the action. For seek: timestamp in seconds or "MM:SS"/"HH:MM:SS" format. For volume: 0-100. For speed: playback rate like "1.5" or "2".'
      }
    },
    required: ['action']
  },

  execute: async (args) => {
    const { action, value } = args;
    const video = WebMCPHelpers.getVideoElement();

    if (!video) {
      return { content: [{ type: 'text', text: 'ERROR: No video player found on page.' }] };
    }

    switch (action) {
      case 'play':
        video.play();
        return { content: [{ type: 'text', text: 'Video playing.' }] };

      case 'pause':
        video.pause();
        return { content: [{ type: 'text', text: 'Video paused.' }] };

      case 'seek': {
        if (!value) {
          return { content: [{ type: 'text', text: 'ERROR: value is required for seek (e.g., "90" or "1:30").' }] };
        }
        let seconds = 0;
        if (value.includes(':')) {
          const parts = value.split(':').map(Number);
          seconds = parts.length === 3
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : parts[0] * 60 + parts[1];
        } else {
          seconds = parseFloat(value);
        }
        if (isNaN(seconds) || seconds < 0) {
          return { content: [{ type: 'text', text: 'ERROR: Invalid seek value.' }] };
        }
        video.currentTime = seconds;
        return { content: [{ type: 'text', text: `Seeked to ${WebMCPHelpers.formatDuration(seconds)}.` }] };
      }

      case 'volume': {
        if (!value) {
          return { content: [{ type: 'text', text: 'ERROR: value is required for volume (0-100).' }] };
        }
        const vol = parseInt(value);
        if (isNaN(vol) || vol < 0 || vol > 100) {
          return { content: [{ type: 'text', text: 'ERROR: Volume must be between 0 and 100.' }] };
        }
        video.volume = vol / 100;
        return { content: [{ type: 'text', text: `Volume set to ${vol}%.` }] };
      }

      case 'speed': {
        if (!value) {
          return { content: [{ type: 'text', text: 'ERROR: value is required for speed (e.g., "1.5", "2").' }] };
        }
        const rate = parseFloat(value);
        if (isNaN(rate) || rate <= 0 || rate > 16) {
          return { content: [{ type: 'text', text: 'ERROR: Speed must be between 0 and 16.' }] };
        }
        video.playbackRate = rate;
        return { content: [{ type: 'text', text: `Playback speed set to ${rate}x.` }] };
      }

      case 'mute':
        video.muted = true;
        return { content: [{ type: 'text', text: 'Video muted.' }] };

      case 'unmute':
        video.muted = false;
        return { content: [{ type: 'text', text: 'Video unmuted.' }] };

      case 'fullscreen': {
        const player = WebMCPHelpers.getYouTubePlayer();
        const fsButton = player?.querySelector('.ytp-fullscreen-button');
        if (fsButton) {
          fsButton.click();
          return { content: [{ type: 'text', text: 'Toggled fullscreen.' }] };
        }
        return { content: [{ type: 'text', text: 'ERROR: Fullscreen button not found.' }] };
      }

      default:
        return { content: [{ type: 'text', text: `ERROR: Unknown action "${action}". Valid actions: play, pause, seek, volume, speed, fullscreen, mute, unmute.` }] };
    }
  }
};
