const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

const BASE_URL = 'https://www.youcinetv.vip';
const cheerioOptions = { decodeEntities: false };
const axiosConfig = { headers: { 'User-Agent': 'Mozilla/5.0' } };

// Utilitário para buscar e carregar uma página
async function fetchAndParse(url, cookie = '') {
  try {
    const config = { ...axiosConfig };
    if (cookie) config.headers.Cookie = cookie;
    const { data } = await axios.get(url, config);
    return cheerio.load(data, cheerioOptions);
  } catch (e) {
    return null;
  }
}

// Extrai menus, banners e categorias da home
async function getHomeData(cookie = '') {
  const $ = await fetchAndParse(BASE_URL, cookie);
  if (!$) return null;
  // Menus principais
  const menus = [];
  $('.menu a').each((i, el) => {
    menus.push({
      title: $(el).text().trim(),
      link: $(el).attr('href')
    });
  });
  // Banners/carrosséis
  const banners = [];
  $('.swiper-slide, .banner-item').each((i, el) => {
    banners.push({
      img: $(el).find('img').attr('src'),
      link: $(el).find('a').attr('href'),
      title: $(el).find('img').attr('alt') || ''
    });
  });
  // Categorias na home
  const categories = [];
  $('.category-title, .vod-type-title').each((i, el) => {
    categories.push({
      title: $(el).text().trim(),
      link: $(el).next('a').attr('href') || ''
    });
  });
  return { menus, banners, categories };
}

// Extrai lista de itens de uma categoria (com paginação)
async function getCategory(url, page = 1, cookie = '') {
  let fullUrl = url.startsWith('http') ? url : BASE_URL + url;
  if (page > 1) fullUrl += `?page=${page}`;
  const $ = await fetchAndParse(fullUrl, cookie);
  if (!$) return null;
  const items = [];
  $('.vod-item, .video-item, .card').each((i, el) => {
    items.push({
      title: $(el).find('.vod-title, .title, h3').text().trim(),
      img: $(el).find('img').attr('src'),
      link: $(el).find('a').attr('href')
    });
  });
  // Paginação
  let hasNext = false;
  const nextBtn = $('.page-next, .pagination-next, .next');
  if (nextBtn.length && !nextBtn.hasClass('disabled')) hasNext = true;
  return { items, hasNext };
}

// Extrai detalhes completos de um item (filme, série, etc)
async function getDetails(url, cookie = '') {
  const fullUrl = url.startsWith('http') ? url : BASE_URL + url;
  const $ = await fetchAndParse(fullUrl, cookie);
  if (!$) return null;
  const title = $('h1, .vod-title').first().text().trim();
  const img = $('.vod-img img, .detail-pic img').attr('src');
  const synopsis = $('.vod_content, .vod-desc, .synopsis').text().trim();
  const genres = [];
  $('.vod-type, .genre a').each((i, el) => genres.push($(el).text().trim()));
  const year = $('.vod-year, .year').text().trim();
  const cast = [];
  $('.vod-actor a, .actor a').each((i, el) => cast.push($(el).text().trim()));
  const episodes = [];
  $('.playlist li, .episodes li').each((i, el) => {
    episodes.push({
      title: $(el).text().trim(),
      link: $(el).find('a').attr('href')
    });
  });
  // Links de vídeo
  const videoLinks = [];
  $('iframe, video source').each((i, el) => {
    videoLinks.push($(el).attr('src'));
  });
  return { title, img, synopsis, genres, year, cast, episodes, videoLinks };
}

// Login real no Youcine
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const jar = new tough.CookieJar();
const axiosJar = wrapper(axios.create({ jar }));

async function loginYoucine(email, password) {
  try {
    // Simula login via o endpoint correto do site
    const loginUrl = BASE_URL + '/user/login/email';
    const payload = `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
    const { data } = await axiosJar.post(loginUrl, payload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'Referer': BASE_URL + '/user/login/email'
      }
    });
    // Checa se login foi bem-sucedido (ajustar conforme resposta do site)
    const cookies = await jar.getCookieString(BASE_URL);
    if (data && (data.success || data.status === 1 || cookies)) {
      return { success: true, cookies };
    }
    return { success: false, error: 'Login falhou' };
  } catch (e) {
    return { success: false, error: 'Login falhou' };
  }
}

// Endpoints REST
app.get('/home', async (req, res) => {
  const data = await getHomeData();
  if (!data) return res.status(500).json({ error: 'Erro ao acessar home.' });
  res.json(data);
});

app.get('/category', async (req, res) => {
  const { url, page } = req.query;
  if (!url) return res.status(400).json({ error: 'Faltou url.' });
  const data = await getCategory(url, page || 1);
  if (!data) return res.status(500).json({ error: 'Erro ao acessar categoria.' });
  res.json(data);
});

app.get('/details', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Faltou url.' });
  const data = await getDetails(url);
  if (!data) return res.status(500).json({ error: 'Erro ao acessar detalhes.' });
  res.json(data);
});

app.post('/login', express.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Faltou usuário/senha.' });
  const data = await loginYoucine(username, password);
  res.json(data);
});

app.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Faltou query.' });
  const url = BASE_URL + '/search?wd=' + encodeURIComponent(q);
  const $ = await fetchAndParse(url);
  if (!$) return res.status(500).json({ error: 'Erro ao buscar.' });
  const items = [];
  $('.vod-item, .video-item, .card').each((i, el) => {
    items.push({
      title: $(el).find('.vod-title, .title, h3').text().trim(),
      img: $(el).find('img').attr('src'),
      link: $(el).find('a').attr('href')
    });
  });
  res.json({ items });
});

app.listen(PORT, () => {
  console.log(`Backend Youcine rodando na porta ${PORT}`);
});
