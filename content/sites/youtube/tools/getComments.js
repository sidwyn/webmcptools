// content/sites/youtube/tools/getComments.js — Read top comments on a video

const GetCommentsTool = {
  name: 'get_comments',
  description: 'Read the top comments on the currently playing YouTube video. Scrolls down to load the comments section.',
  inputSchema: {
    type: 'object',
    properties: {
      maxComments: {
        type: 'integer',
        description: 'Maximum number of comments to return. Defaults to 10.'
      }
    }
  },

  execute: async (args) => {
    const { maxComments = 10 } = args;

    if (!window.location.href.includes('/watch')) {
      return { content: [{ type: 'text', text: 'ERROR: Not on a video page.' }] };
    }

    // Scroll down to load the comments section
    const commentsSection = document.querySelector('ytd-comments#comments');
    if (commentsSection) {
      commentsSection.scrollIntoView({ behavior: 'smooth' });
      await WebMCPHelpers.sleep(2000);
    } else {
      window.scrollBy(0, 600);
      await WebMCPHelpers.sleep(2000);
    }

    const commentEls = document.querySelectorAll('ytd-comment-thread-renderer');
    if (commentEls.length === 0) {
      return { content: [{ type: 'text', text: 'No comments found. Comments may be disabled or still loading.' }] };
    }

    const comments = Array.from(commentEls).slice(0, maxComments).map((el, i) => {
      const author = el.querySelector('#author-text')?.textContent?.trim() || 'Unknown';
      const text = el.querySelector('#content-text')?.textContent?.trim() || '';
      const likes = el.querySelector('#vote-count-middle')?.textContent?.trim() || '0';
      const time = el.querySelector('.published-time-text a, #header-author .published-time-text')?.textContent?.trim() || '';
      return `${i + 1}. ${author} (${time}, ${likes} likes):\n   "${text}"`;
    });

    return { content: [{ type: 'text', text: `Top comments (${comments.length}):\n\n${comments.join('\n\n')}` }] };
  }
};
