import { Fragment } from 'react';
import { View } from 'react-native';

import type { Explained } from '@/lib/breakdown';

import { ListRow } from './ListRow';
import { Money } from './Money';

/** One person's share, line by line, adding up to it. */
export function Breakdown({ explained, whose }: { explained: Explained; whose: string }) {
  return (
    <View>
      {explained.items.map((row, index) => (
        <ListRow
          key={`item-${index}`}
          title={row.title}
          {...(row.detail ? { subtitle: row.detail } : {})}
          trailing={<Money cents={row.cents} />}
        />
      ))}
      {explained.adjustments.length > 0 ? (
        <Fragment>
          <ListRow
            title={`${whose} items`}
            subtitle={`${explained.percentOfItems} of all items, so ${explained.percentOfItems} of the rest`}
            trailing={<Money cents={explained.itemsCents} />}
          />
          {explained.adjustments.map((row, index) => (
            <ListRow
              key={`adjustment-${index}`}
              title={row.title}
              {...(row.detail ? { subtitle: row.detail } : {})}
              trailing={<Money cents={row.cents} />}
            />
          ))}
        </Fragment>
      ) : null}
      <ListRow
        title={`${whose} share`}
        trailing={<Money cents={explained.totalCents} variant="bodyMedium" />}
        divider={false}
      />
    </View>
  );
}
