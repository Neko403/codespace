const yts = require('yt-search');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, videoId } = req.query;

    if (videoId) {
      const search = await yts({ videoId });
      if (!search?.videos?.length) {
        return res.status(404).json({ error: 'Video not found' });
      }

      const video = search.videos[0];
      return res.json({
        success: true,
        data: {
          videoId: video.videoId,
          title: video.title,
          author: video.author.name,
          duration: video.duration.toString(),
          views: video.views,
          thumbnail: video.thumbnail,
          url: video.url
        }
      });
    }

    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    const search = await yts(query);
    if (!search?.videos?.length) {
      return res.status(404).json({ error: 'No results found' });
    }

    const results = search.videos.slice(0, 10).map(video => ({
      videoId: video.videoId,
      title: video.title,
      author: video.author.name,
      duration: video.duration.toString(),
      views: video.views,
      thumbnail: video.thumbnail,
      url: video.url
    }));

    res.json({ success: true, data: results });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
};
