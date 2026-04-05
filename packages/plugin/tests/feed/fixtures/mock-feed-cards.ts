import type { FeedCardRow } from '../../../src/types/feed-card-types';

/**
 * Mock dataset for feed card tests.
 *
 * 8 cards covering key type/size combinations:
 *   - market xs, m, xl
 *   - post m (with carousel)
 *   - video ml
 *   - advert m
 *   - product s (independent)
 *   - collection m
 */
export const MOCK_FEED_CARDS: FeedCardRow[] = [
  // ── Market xs ──────────────────────────────────────────────────────
  {
    '#Feed_CardType': 'market',
    '#Feed_CardSize': 'xs',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '0',
    '#Feed_ImageUrl': 'https://avatars.mds.yandex.net/get-mpic/example1/orig',
    '#Feed_Title': 'Кроссовки Nike Air Max 90',
    '#Feed_Price': '8 999',
    '#Feed_Currency': '₽',
    '#Feed_HasCashback': 'true',
    '#Feed_CashbackLabel': '450',
    '#Feed_ImageRatio': '1:1',
  },

  // ── Market m ───────────────────────────────────────────────────────
  {
    '#Feed_CardType': 'market',
    '#Feed_CardSize': 'm',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '1',
    '#Feed_ImageUrl': 'https://avatars.mds.yandex.net/get-mpic/example2/orig',
    '#Feed_Title': 'Робот-пылесос Xiaomi Roborock S8 Pro Ultra',
    '#Feed_Price': '54 990',
    '#Feed_OldPrice': '69 990',
    '#Feed_Currency': '₽',
    '#Feed_Discount': '-21%',
    '#Feed_SourceName': 'Яндекс Маркет',
    '#Feed_ImageRatio': '3:4',
  },

  // ── Market xl ──────────────────────────────────────────────────────
  {
    '#Feed_CardType': 'market',
    '#Feed_CardSize': 'xl',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '2',
    '#Feed_ImageUrl': 'https://avatars.mds.yandex.net/get-mpic/example3/orig',
    '#Feed_Title': 'Телевизор Samsung OLED 65" QE65S90CAUXRU',
    '#Feed_Price': '149 990',
    '#Feed_OldPrice': '179 990',
    '#Feed_Currency': '₽',
    '#Feed_Discount': '-17%',
    '#Feed_Description': 'OLED-матрица, 4K UHD, Smart TV, 120 Гц',
    '#Feed_SourceName': 'Яндекс Маркет',
    '#Feed_HasCashback': 'true',
    '#Feed_CashbackLabel': '7 499',
    '#Feed_ImageRatio': '16:9',
  },

  // ── Post m (carousel) ─────────────────────────────────────────────
  {
    '#Feed_CardType': 'post',
    '#Feed_CardSize': 'm',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '3',
    '#Feed_ImageUrl': 'https://avatars.mds.yandex.net/get-mpic/example4/orig',
    '#Feed_CarouselImages': JSON.stringify([
      'https://avatars.mds.yandex.net/get-mpic/example4a/orig',
      'https://avatars.mds.yandex.net/get-mpic/example4b/orig',
      'https://avatars.mds.yandex.net/get-mpic/example4c/orig',
    ]),
    '#Feed_CarouselCount': '3',
    '#Feed_SourceName': 'belleyou.ru',
    '#Feed_SourceAvatarUrl':
      'https://avatars.mds.yandex.net/get-entity_search/example4_avatar/orig',
    '#Feed_Title': 'Весенние образы 2026: что носить этой весной',
    '#Feed_HasAiBadge': 'false',
    '#Feed_ImageRatio': '3:4',
  },

  // ── Video ml ───────────────────────────────────────────────────────
  {
    '#Feed_CardType': 'video',
    '#Feed_CardSize': 'ml',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '4',
    '#Feed_ImageUrl': 'https://avatars.mds.yandex.net/get-mpic/example5/orig',
    '#Feed_SourceName': 'BORK',
    '#Feed_SourceAvatarUrl':
      'https://avatars.mds.yandex.net/get-entity_search/example5_avatar/orig',
    '#Feed_HasVideo': 'true',
    '#Feed_HasSound': 'true',
    '#Feed_Title': 'Обзор кофемашины BORK C830',
    '#Feed_ImageRatio': '16:9',
  },

  // ── Advert m ───────────────────────────────────────────────────────
  {
    '#Feed_CardType': 'advert',
    '#Feed_CardSize': 'm',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '5',
    '#Feed_ImageUrl': 'https://avatars.mds.yandex.net/get-direct/example6/orig',
    '#Feed_SourceDomain': 'start.practicum.yandex',
    '#Feed_SourceLabel': 'Реклама',
    '#Feed_Title': 'Курсы аналитики данных',
    '#Feed_Description': 'Освойте Python и SQL за 6 месяцев. Первые 3 урока бесплатно.',
    '#Feed_AdStyle': 'production',
    '#Feed_ImageRatio': '1:1',
  },

  // ── Product s (independent) ────────────────────────────────────────
  {
    '#Feed_CardType': 'product',
    '#Feed_CardSize': 's',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '6',
    '#Feed_ImageUrl': 'https://avatars.mds.yandex.net/get-mpic/example7/orig',
    '#Feed_Title': 'Наушники Sony WH-1000XM5',
    '#Feed_Price': '29 990',
    '#Feed_Currency': '₽',
    '#Feed_ProductType': 'independent',
    '#Feed_MoreCount': '12',
    '#Feed_ImageRatio': '1:1',
  },

  // ── Collection m ───────────────────────────────────────────────────
  {
    '#Feed_CardType': 'collection',
    '#Feed_CardSize': 'm',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '7',
    '#Feed_SourceName': 'Мария Иванова',
    '#Feed_SourceAvatarUrl':
      'https://avatars.mds.yandex.net/get-entity_search/example8_avatar/orig',
    '#Feed_Title': 'Лучшие гаджеты для кухни',
    '#Feed_CollectionSubtitle': 'Коллекция автора',
    '#Feed_ViewCount': '12,2 тыс.',
    '#Feed_PostCount': '5 постов',
    '#Feed_CollectionImages': JSON.stringify([
      'https://avatars.mds.yandex.net/get-mpic/example8a/orig',
      'https://avatars.mds.yandex.net/get-mpic/example8b/orig',
      'https://avatars.mds.yandex.net/get-mpic/example8c/orig',
      'https://avatars.mds.yandex.net/get-mpic/example8d/orig',
    ]),
  },
];
