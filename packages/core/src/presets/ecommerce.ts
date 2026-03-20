import type { ProductSchema, OfferSchema, OfferData, JsonLdBase } from '../types.js';

function buildOfferData(offer: OfferData): JsonLdBase {
  const schema: JsonLdBase = {
    '@type': 'Offer',
    price: offer.price,
    priceCurrency: offer.priceCurrency,
  };

  if (offer.availability) {
    schema.availability = `https://schema.org/${offer.availability}`;
  }

  if (offer.url) {
    schema.url = offer.url;
  }

  return schema;
}

export function buildProduct(config: ProductSchema): JsonLdBase {
  const schema: JsonLdBase = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: config.name,
    url: config.url,
  };

  if (config.description) {
    schema.description = config.description;
  }

  if (config.image) {
    schema.image = config.image;
  }

  if (config.sku) {
    schema.sku = config.sku;
  }

  if (config.brand) {
    schema.brand = {
      '@type': 'Brand',
      name: config.brand,
    };
  }

  if (config.offers) {
    const offers = Array.isArray(config.offers) ? config.offers : [config.offers];
    schema.offers = offers.map(buildOfferData);
  }

  return schema;
}

export function buildOffer(config: OfferSchema): JsonLdBase {
  const schema: JsonLdBase = {
    '@context': 'https://schema.org',
    '@type': 'Offer',
    price: config.price,
    priceCurrency: config.priceCurrency,
  };

  if (config.availability) {
    schema.availability = `https://schema.org/${config.availability}`;
  }

  if (config.url) {
    schema.url = config.url;
  }

  if (config.itemOffered) {
    schema.itemOffered = {
      '@type': 'Product',
      name: config.itemOffered.name,
      url: config.itemOffered.url,
    };
  }

  return schema;
}
