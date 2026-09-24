import { BareShell, hint13Case } from '../../../test/navigation-scenario';

hint13Case({
    name: 'control: content only the previous page rendered, now unmounted, records nothing at the new URL',
    shell: BareShell,
    wired: true,
    reportedAtNewUrl: false,
});
