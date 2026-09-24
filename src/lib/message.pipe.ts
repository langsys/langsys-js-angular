import { Pipe, inject, type PipeTransform } from '@angular/core';
import type { ServerMessage } from 'langsys-js-typescript';
import { LangsysService } from './langsys.service';

/**
 * Render a server message entry in a template (spec MSG-5):
 *
 * ```html
 * @for (entry of errors; track entry.code) {
 *     <p class="error">{{ entry | tMessage }}</p>
 * }
 * {{ entry | tMessage: 'Checkout' }}   <!-- a category other than the configured one -->
 * ```
 *
 * Entries come from the server — `resolveServerMessages(body)` finds them wherever they sit in a
 * response. What the pipe shows is the base SDK's decision (`LangsysService.renderServerMessage`):
 * the translated template when the catalog holds one, the entry's own `message` otherwise.
 *
 * Impure, and unmemoized: a message renders through `t()`, which records a missing template at
 * the current URL, and a page holds only a handful of messages.
 */
@Pipe({
    name: 'tMessage',
    standalone: true,
    pure: false,
})
export class MessagePipe implements PipeTransform {
    private readonly langsys = inject(LangsysService);

    transform(entry: ServerMessage | null | undefined, category?: string): string {
        return entry ? this.langsys.renderServerMessage(entry, category) : '';
    }
}
