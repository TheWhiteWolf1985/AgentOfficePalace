import { t as uiText } from '../../shared/i18n';

/** The categories down the side of ⚙️ Settings. */
export type SettingsPane = 'you' | 'language' | 'graphics' | 'sound' | 'notify' | 'building' | 'atrium-logo' | 'workers' | 'connections' | 'management' | 'floors' | 'plugins' | 'updates';

export const PANES: { id: SettingsPane; icon: string; label: string; blurb: string }[] = [
  { id: 'language', icon: '🌐', label: uiText('Language'), blurb: uiText('Choose the language of this interface.') },
  { id: 'you', icon: '🧍', label: uiText('You'), blurb: uiText('How you look, how you see the office, and how you’re signed in.') },
  { id: 'graphics', icon: '🖥️', label: uiText('Graphics'), blurb: uiText('Balance visual detail and rendering load on this device.') },
  { id: 'sound', icon: '🔊', label: uiText('Sound & voice'), blurb: uiText('How loud the office is for you, and how voice chat works.') },
  { id: 'notify', icon: '🔔', label: uiText('Notifications'), blurb: uiText('Hear about a worker that needs someone, or finished, while you’re somewhere else.') },
  { id: 'building', icon: '🏢', label: uiText('Building'), blurb: uiText('The sky and where new floors are cloned.') },
  { id: 'floors', icon: '🗂️', label: uiText('Floor management'), blurb: uiText('Office repositories and workspace folders.') },
  { id: 'atrium-logo', icon: '🖼️', label: uiText('Atrium logo'), blurb: uiText('Centered text or your company logo, visible to everyone in the building.') },
  { id: 'workers', icon: '🤖', label: uiText('Workers'), blurb: uiText('What workers start on, how many run at once, when they go home and what the office tells them.') },
  { id: 'management', icon: '👥', label: uiText('Agent management'), blurb: uiText('Individual agents, properties and repository identities across all offices.') },
  { id: 'connections', icon: '🔗', label: uiText('GitHub and Forgejo'), blurb: uiText('Servers, accounts and remote repositories.') },
  { id: 'plugins', icon: '🧩', label: 'Plugin & Skills', blurb: uiText('Connected tools and skills are available to every agent.') },
];
