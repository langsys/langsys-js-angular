import { ShellWithComputedTranslation, hint13Case } from '../../../test/navigation-scenario';

hint13Case({
    name: 'a computed translation in the layout is reported for the page navigated to',
    shell: ShellWithComputedTranslation,
    wired: true,
    reportedAtNewUrl: true,
});
