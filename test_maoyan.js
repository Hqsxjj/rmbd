async function test() {
  const url = 'https://m.maoyan.com/ajax/movieOnInfoList?token=&optimize=1';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Referer': 'https://m.maoyan.com/'
      }
    });
    const text = await res.text();
    console.log(text.substring(0, 1000));
  } catch (e) {
    console.error(e);
  }
}
test();
