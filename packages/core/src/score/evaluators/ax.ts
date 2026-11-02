// controls (static-HTML proxies of the accessibility-tree checks, published as such):
// ax.document-structure, ax.native-controls, ax.accessible-names, ax.form-labeling,
// ax.injection-safe.
import { INJECTION_PATTERNS } from '../catalog.js';
import {
  collectAttributeTexts,
  countNonNativeClickables,
  findLandmarks,
  headingOrderIssue,
} from '../html-lite.js';
import { notApplicable, scored, type EvaluatorEntry } from './shared.js';

const LISTED_UNNAMED = 8;

export const axEvaluators: Record<string, EvaluatorEntry> = {
  'ax.document-structure': {
    needsHomepage: true,
    run: (context) => {
      const homepage = context.homepage;
      const landmarks = findLandmarks(homepage.body);
      const headings = homepage.headings;
      const orderIssue = headingOrderIssue(headings);
      const passed = [landmarks.main, landmarks.nav, orderIssue === null].filter(Boolean).length;
      const sequence = headings
        .slice(0, 12)
        .map((heading) => `h${heading.level}`)
        .join(' ');
      const evidence = [
        landmarks.main ? 'main landmark present' : 'no main landmark',
        landmarks.nav ? 'nav landmark present' : 'no nav landmark',
        headings.length === 0
          ? 'no headings'
          : orderIssue === null
            ? `heading order sane (${sequence}${headings.length > 12 ? ' ...' : ''})`
            : `heading order not sane: ${orderIssue} (${sequence}${headings.length > 12 ? ' ...' : ''})`,
        `${passed}/3 sub-rules`,
      ]
        .filter(Boolean)
        .join('; ');
      return scored(passed / 3, evidence, ['homepage']);
    },
  },
  'ax.native-controls': {
    needsHomepage: true,
    run: (context) => {
      const count = countNonNativeClickables(context.homepage.body);
      const fraction = count === 0 ? 1 : count <= 2 ? 0.5 : 0;
      return scored(
        fraction,
        `${count} div/span/li/p/section/img/td elements with onclick or role=button`,
        ['homepage']
      );
    },
  },
  'ax.accessible-names': {
    needsHomepage: true,
    run: (context) => {
      const controls = context.homepage.controls;
      if (controls.total === 0) {
        return notApplicable('no-controls', 'the homepage has no buttons, links or submit inputs', ['homepage']);
      }
      const unnamed = controls.unnamed
        .slice(0, LISTED_UNNAMED)
        .map((control) => {
          const bits = [control.tag];
          if (control.id) bits.push(`#${control.id}`);
          if (control.href) bits.push(`href=${control.href}`);
          return bits.join(' ');
        })
        .join(', ');
      const evidence = [
        `${controls.named}/${controls.total} controls named`,
        controls.unnamed.length > 0
          ? `unnamed: ${unnamed}${controls.unnamed.length > LISTED_UNNAMED ? ` and ${controls.unnamed.length - LISTED_UNNAMED} more` : ''}`
          : '',
      ]
        .filter(Boolean)
        .join('; ');
      return scored(controls.named / controls.total, evidence, ['homepage']);
    },
  },
  'ax.form-labeling': {
    needsHomepage: true,
    run: (context) => {
      const fields = context.homepage.fields;
      if (fields.total === 0) {
        return notApplicable('no-fields', 'the homepage has no form fields', ['homepage']);
      }
      const unlabelled = fields.unlabelled
        .slice(0, LISTED_UNNAMED)
        .map((field) => {
          const bits = [field.tag];
          if (field.id) bits.push(`#${field.id}`);
          if (field.type) bits.push(`type=${field.type}`);
          if (field.name) bits.push(`name=${field.name}`);
          return bits.join(' ');
        })
        .join(', ');
      const evidence = [
        `${fields.labelled}/${fields.total} fields labelled (label[for], wrapping label, aria-label or aria-labelledby; placeholders never count)`,
        fields.unlabelled.length > 0
          ? `unlabelled: ${unlabelled}${fields.unlabelled.length > LISTED_UNNAMED ? ` and ${fields.unlabelled.length - LISTED_UNNAMED} more` : ''}`
          : '',
      ]
        .filter(Boolean)
        .join('; ');
      return scored(fields.labelled / fields.total, evidence, ['homepage']);
    },
  },
  'ax.injection-safe': {
    needsHomepage: true,
    run: (context) => {
      const texts = collectAttributeTexts(context.homepage.body);
      for (const text of texts) {
        for (const pattern of INJECTION_PATTERNS) {
          const match = text.match(pattern);
          if (match) {
            return scored(0, `pattern "${match[0]}" found in attribute or hidden text: "${text.slice(0, 120)}"`, [
              'homepage',
            ]);
          }
        }
      }
      return scored(1, `${texts.length} alt/aria-label/title values and hidden texts scanned, no injection pattern`, [
        'homepage',
      ]);
    },
  },
};
