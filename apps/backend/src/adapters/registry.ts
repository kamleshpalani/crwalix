import type { Adapter } from '../types.js';
import { googleMapsAdapter } from './google-maps.js';
import { googleSerpAdapter } from './google-serp.js';
import { emailPhoneAdapter } from './email-phone.js';
import { yelpAdapter } from './yelp.js';
import { amazonAdapter } from './amazon.js';
import { instagramAdapter } from './instagram.js';
import { genericAdapter } from './generic.js';

const adapters: Record<string, Adapter<any, any>> = {
  [googleMapsAdapter.name]: googleMapsAdapter,
  [googleSerpAdapter.name]: googleSerpAdapter,
  [emailPhoneAdapter.name]: emailPhoneAdapter,
  [yelpAdapter.name]: yelpAdapter,
  [amazonAdapter.name]: amazonAdapter,
  [instagramAdapter.name]: instagramAdapter,
  [genericAdapter.name]: genericAdapter,
};

export function getAdapter(name: string): Adapter | undefined {
  return adapters[name];
}

export function listAdapters(): Array<{ name: string; description: string }> {
  return Object.values(adapters).map((a) => ({
    name: a.name,
    description: a.description,
  }));
}
