import { declareIndexPlugin, ReactRNPlugin } from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';
import { bookSlots, highlightSlots, powerups, settings, storage } from './consts';
import { fetchFromExportApi as getReadwiseExportsSince } from '../lib/readwise';
import { importBooksAndHighlights } from '../lib/import';

async function onActivate(plugin: ReactRNPlugin) {
  await plugin.settings.registerStringSetting({
    id: settings.apiKey,
    title: 'Readwise API Key',
    defaultValue: '',
    description:
      'Paste your Readwise API key here. Follow the instructions here if you do not have a key: https://www.readwise.io/access_token',
  });

  await plugin.app.registerPowerup(
    'Readwise Book',
    powerups.book,
    'Represents a book from Readwise',
    {
      slots: [
        {
          code: bookSlots.bookId,
          name: 'Book ID',
          hidden: true,
        },
        {
          code: bookSlots.author,
          name: 'Author',
        },
        {
          code: bookSlots.image,
          name: 'Image',
        },
        {
          code: bookSlots.category,
          name: 'Category',
        },
        {
          code: bookSlots.tags,
          name: 'Tags',
        },
      ],
    }
  );

  await plugin.app.registerPowerup(
    'Readwise Highlight',
    powerups.highlight,
    'Represents a highlight from Readwise',
    {
      slots: [
        {
          code: highlightSlots.highlightId,
          name: 'Highlight ID',
          hidden: true,
        },
        {
          code: highlightSlots.tags,
          name: 'Tags',
        },
      ],
    }
  );

  let timeout: NodeJS.Timeout | undefined;

  const syncHighlights = async (opts: { ignoreLastSync?: boolean; notify?: boolean }) => {
    const apiKey = await plugin.settings.getSetting<string>(settings.apiKey);
    if (!apiKey) {
      const msg = 'No Readwise API key set. Please follow the instructions in the plugin settings.';
      console.log(msg);
      plugin.app.toast(msg);
      return;
    }
    const lastSync = opts.ignoreLastSync
      ? undefined
      : await plugin.storage.getSynced<string>(storage.lastSync);
    try {
      const result = await getReadwiseExportsSince(apiKey, lastSync);
      if (result.success) {
        const books = result.data;
        if (books && books.length > 0) {
          const msg1 = 'Importing books and highlights...';
          console.log(msg1);
          if (opts.notify) {
            plugin.app.toast(msg1);
          }
          await importBooksAndHighlights(plugin, books);
          const msg = 'Finished importing books and highlights.';
          console.log(msg);
          if (opts.notify) {
            plugin.app.toast(msg);
          }
        } else {
          const msg = 'No new books or highlights to import.';
          console.log(msg);
          if (opts.notify) {
            plugin.app.toast(msg);
          }
        }
        await plugin.storage.setSynced(storage.lastSync, new Date().toISOString());
      } else {
        if (result.error == 'auth') {
          const msg =
            'Readwise API key is invalid. Please follow the instructions in the plugin settings.';
          console.log(msg);
          plugin.app.toast(msg);
          return;
        } else {
          console.log(result.error);
          plugin.app.toast('Failed to sync Readwise highlights: ' + result.error);
          return;
        }
      }
    } catch (e) {
      console.log(e);
      plugin.app.toast('Failed to sync Readwise highlights.');
    } finally {
      clearTimeout(timeout);
      setTimeout(syncHighlights, 1000 * 60 * 30);
    }
  };

  plugin.app.registerCommand({
    id: 'syncLatestHighlights',
    name: 'Readwise Sync Latest',
    description:
      'Sync any unsynced Readwise books and highlights since the last sync time. This command is run automatically for you in the background every 30 minutes.',
    action: async () => {
      await syncHighlights({ notify: true });
    },
  });

  plugin.app.registerCommand({
    id: 'syncAllHighlights',
    name: 'Readwise Sync All',
    description:
      'Sync all Readwise books and highlights into RemNote. You should only need to run this command the first time you use the plugin.',
    action: async () => {
      await syncHighlights({ ignoreLastSync: true, notify: true });
    },
  });

  const lastSync = await plugin.storage.getSynced<string>(storage.lastSync);
  if (!lastSync || new Date(lastSync).getTime() < new Date().getTime() - 1000 * 60 * 30) {
    syncHighlights({});
  } else {
    clearTimeout(timeout);
    setTimeout(syncHighlights, 1000 * 60 * 30 - (Date.now() - new Date(lastSync).getTime()));
  }
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
