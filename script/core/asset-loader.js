export class AssetLoader {
  #cache = new Map();

  load(url) {
    if (!this.#cache.has(url)) {
      this.#cache.set(url, this.#createImage(url));
    }

    return this.#cache.get(url);
  }

  preloadAll(urls) {
    return Promise.all(urls.map((url) => this.load(url)));
  }

  async #createImage(url) {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;

    try {
      await image.decode();
      return image;
    } catch {
      if (image.complete && image.naturalHeight > 0) {
        return image;
      }
      if (image.complete) {
        throw new Error(`资源加载失败: ${url}`);
      }
      await new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', () => reject(new Error(`资源加载失败: ${url}`)), {
          once: true,
        });
      });
      return image;
    }
  }
}
