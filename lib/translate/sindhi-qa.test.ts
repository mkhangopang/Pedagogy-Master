import { describe, it, expect } from 'vitest';
import {
  applySindhiChecksAndBalances,
  cleanBracketedEnglishTerms,
  cleanUrduInterferenceInSindhi,
  restoreStashedSegments,
  splitMarkdownForContextReview,
  stashNonTranslatableSegments,
} from './sindhi-qa';

describe('Sindhi Translation QA & Checks and Balances', () => {
  it('keeps first occurrence of scientific English terms in brackets and removes repetitions', () => {
    const input = [
      '# فوٽوسنٿيسس (Photosynthesis) جو سبق',
      'ٻوٽا فوٽوسنٿيسس (Photosynthesis) ذريعي خوراڪ ٺاهيندا آهن.',
      'تجزيي ۾ بلوم جي ٽيڪسونامي (Bloom\'s Taxonomy) استعمال ڪئي وئي آهي.',
      'آخري مرحلي ۾ بلوم جي ٽيڪسونامي (Bloom\'s Taxonomy) ۽ فوٽوسنٿيسس (photosynthesis) جو جائزو ورتو ويندو.',
    ].join('\n');

    const { cleanedText, keptTerms, deduplicatedCount } = cleanBracketedEnglishTerms(input);

    expect(keptTerms).toEqual(['Photosynthesis', "Bloom's Taxonomy"]);
    expect(deduplicatedCount).toBe(3);
    expect(cleanedText).toContain('# فوٽوسنٿيسس (Photosynthesis) جو سبق');
    expect(cleanedText).toContain('ٻوٽا فوٽوسنٿيسس ذريعي خوراڪ ٺاهيندا آهن.');
    expect(cleanedText).toContain("تجزيي ۾ بلوم جي ٽيڪسونامي (Bloom's Taxonomy) استعمال ڪئي وئي آهي.");
    expect(cleanedText).toContain('آخري مرحلي ۾ بلوم جي ٽيڪسونامي ۽ فوٽوسنٿيسس جو جائزو ورتو ويندو.');
  });

  it('strips common everyday English words from brackets while keeping quiz option markers', () => {
    const input = [
      'شاگرد (Student) ۽ استاد (Teacher) سبق (Lesson) پڙهندا.',
      'سوال (a) صحيح جواب چونڊيو.',
      'سائنسي طريقو: مفروضو (Hypothesis) ۽ مشاهداتي عمل (Observation).',
    ].join('\n');

    const { cleanedText, keptTerms } = cleanBracketedEnglishTerms(input);

    expect(cleanedText).not.toContain('(Student)');
    expect(cleanedText).not.toContain('(Teacher)');
    expect(cleanedText).not.toContain('(Lesson)');
    expect(cleanedText).toContain('(a)');
    expect(keptTerms).toEqual(['Hypothesis', 'Observation']);
  });

  it('cleans Urdu Bari Yeh interference and preserves stashed placeholders + RTL flow', () => {
    const english = 'Teach `[SLO: S-08-A-01]` Photosynthesis with $E=mc^2$.';
    const stashed = stashNonTranslatableSegments(english);

    const simulatedRefined =
      'ZINLINE0Z فوٽوسنٿيسس (Photosynthesis) ۽ توانائي ZINLINE1Z جي وضاحت ڪرے ٿو.';

    const { text, report } = applySindhiChecksAndBalances(
      simulatedRefined,
      stashed.workingText
    );

    expect(report.valid).toBe(true);
    expect(text).not.toContain('ے');
    expect(text).toContain('ڪري ٿو');

    const finalRestored = restoreStashedSegments(text, stashed);
    expect(finalRestored).toContain('`[SLO: S-08-A-01]`');
    expect(finalRestored).toContain('$E=mc^2$');
    expect(cleanUrduInterferenceInSindhi('پڑھتے')).toContain('پڑھتي');
  });

  it('flags missing placeholders or low Sindhi script ratio so broken outputs are caught', () => {
    const english = 'Explain `[SLO: M-09-B-02]` quadratic equations in detail across curriculum stages.';
    const stashed = stashNonTranslatableSegments(english);

    const missingTokenResult = applySindhiChecksAndBalances(
      'هي سبق مساواتن بابت آهي.',
      stashed.workingText
    );
    expect(missingTokenResult.report.valid).toBe(false);
    expect(missingTokenResult.report.reason).toBe('MISSING_PLACEHOLDERS');

    const untranslatedEnglishResult = applySindhiChecksAndBalances(
      `${stashed.workingText} This text was mistakenly left completely in English without any Sindhi translation at all.`,
      stashed.workingText
    );
    expect(untranslatedEnglishResult.report.valid).toBe(false);
    expect(untranslatedEnglishResult.report.reason).toBe('LOW_SINDHI_SCRIPT_RATIO');
  });

  it('splits large markdown cleanly while keeping aligned draft chunks', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `## Section ${i}\nLine content for item ${i}`);
    const eng = lines.join('\n');
    const draft = lines.map((l) => `SD:${l}`).join('\n');

    const chunks = splitMarkdownForContextReview(eng, draft, 400);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.english).join('\n')).toBe(eng);
    expect(chunks.map((c) => c.draft).join('\n')).toBe(draft);
  });
});
