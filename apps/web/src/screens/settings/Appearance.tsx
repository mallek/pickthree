import { Seg, Switch, type ThemeChoice } from '@pickthree/ui';
import { useActions, useAppState } from '../../state/store.tsx';

export const THEME_WORDS: Record<ThemeChoice, string> = {
  system: 'System',
  dark: 'Dark',
  light: 'Light',
};

const THEMES: ThemeChoice[] = ['system', 'dark', 'light'];

/** Appearance: the theme and the Pokémon pictures switch. Reads the store, so both show a change
 * at once on this pushed page. */
export function Appearance() {
  const s = useAppState();
  const { updateSettings } = useActions();
  return (
    <div className="settings-page">
      <section className="settings-block">
        <h4 className="settings-head">Theme</h4>
        <Seg
          value={s.settings.theme}
          onChange={(theme) => updateSettings({ theme })}
          options={THEMES.map((t) => ({ value: t, label: THEME_WORDS[t] }))}
        />
      </section>
      <Switch
        label="Pokémon pictures"
        line="Off shows a colored initial instead"
        checked={s.settings.sprites !== false}
        onChange={(sprites) => updateSettings((cur) => ({ ...cur, sprites }))}
      />
    </div>
  );
}
