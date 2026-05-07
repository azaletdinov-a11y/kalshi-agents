import axios from 'axios';

interface NewsArticle {
  title: string;
  description: string;
  publishedAt: string;
  source: { name: string };
  url: string;
}

interface NewsResponse {
  articles: NewsArticle[];
}

export async function searchNews(query: string): Promise<string> {
  const res = await axios.get<NewsResponse>('https://newsapi.org/v2/everything', {
    params: {
      q: query,
      apiKey: process.env.NEWS_API_KEY,
      pageSize: 5,
      sortBy: 'relevancy',
      language: 'en',
    },
  });

  const articles = res.data.articles ?? [];
  if (articles.length === 0) return 'No recent news found.';

  return articles
    .map((a, i) => {
      const date = new Date(a.publishedAt).toLocaleDateString();
      return `[${i + 1}] ${a.title} — ${a.source.name} (${date})\n${a.description ?? ''}`;
    })
    .join('\n\n');
}
