"use strict";

/* Shared Test Journey rendering used by Results and Activity Tracker. */

let journeyPreviewFactory = null;
let journeyPreviewScoring = null;
let journeyConceptMapStore = {};
let journeyTimelineResizeObserver = null;

function renderJourneyDetail(data) {
    const detail = $('#journeyDetailView');
    const header = $('#journeyDetailHeader');
    const summary = data.summary || {};
    const eventCounts = data.eventCounts || { total: 0, types: {}, subTypes: {} };
    const flags = data.flags || {};
    journeyConceptMapStore = {};

    header.html(`<span>${journeyEsc([journeyPrimaryLoginName(summary), journeyRunPasswordLabel(summary) || summary.passwordId].filter(value => String(value || '').trim() !== '').join(' / '))}</span>`);

    detail.html(/* html */`
        <div class="journeyShell">
            ${journeySummaryHtml(summary, eventCounts, flags, data.pageStats || [])}
            ${journeyPageStatsHtml(data.pageStats || [])}
            ${journeyPageDetailHtml(data)}
            ${journeyTimelineHtml(data.timeline || [], data.pageStats || [])}
        </div>
    `);

    $('.journeyPageRow').off('click').on('click', function() {
        const pageId = $(this).data('page');
        const target = document.getElementById(`journeyPage_${pageId}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('.journeyConceptMapBtn').off('click').on('click', function() {
        const dataKey = $(this).data('cmkey');
        journeyOpenConceptMap(dataKey, $(this).data('question') || '');
    });
    $('.journeyAnswerHistory').prop('open', false);
    if (typeof MathJax !== 'undefined' && typeof MathJax.typeset === 'function') MathJax.typeset();
    window.requestAnimationFrame(journeyUpdateTimelineAnchorVisibility);
    $(window).off('resize.testJourneyTimeline').on('resize.testJourneyTimeline', journeyUpdateTimelineAnchorVisibility);
    if (journeyTimelineResizeObserver) journeyTimelineResizeObserver.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
        journeyTimelineResizeObserver = new ResizeObserver(journeyUpdateTimelineAnchorVisibility);
        journeyTimelineResizeObserver.observe(detail.get(0));
        const shell = detail.find('.journeyShell').get(0);
        if (shell) journeyTimelineResizeObserver.observe(shell);
    }
}

function journeyUpdateTimelineAnchorVisibility() {
    const detail = document.getElementById('journeyDetailView');
    const anchor = detail?.querySelector('.journeyLogAnchor');
    if (!anchor || !detail) return;
    anchor.classList.toggle('is-visible', detail.scrollHeight > detail.clientHeight + 1);
}

function journeySummaryHtml(summary, eventCounts, flags, pageStats = []) {
    const scoring = summary.score || {};
    const connection = journeyConnectionState(summary, flags);
    const runType = journeyRunTypeInfo(summary);
    const displayName = summary.displayName || '';
    const profileName = journeyPrimaryLoginName(summary);
    const chartHtml = [
        journeyProfileProgressChart(summary),
        journeyProfileTimeChart(summary),
        scoring.available ? journeyProfilePointsChart(scoring) : ''
    ].filter(Boolean).join('');
    const detailHtml = [
        journeyProfileTimelineGroup(summary, eventCounts),
        journeyProfileActivityGroup(summary, flags, eventCounts, scoring)
    ].filter(Boolean).join('');

    return /* html */`
        <section class="journeyBand journeyProfile">
            <div class="journeyProfileHero">
                <div class="journeyProfileAvatar"><img src="${journeyEsc(runType.icon)}" alt=""></div>
                <div class="journeyProfileIdentity">
                    <span>${journeyEsc(runType.label)}</span>
                    <strong>${journeyEsc(profileName)}</strong>
                    <div class="journeyProfileNames">
                        ${summary.loginTemplate === 'cloned'
                            ? journeyProfileNameChip(UILANG.m('Template login'), journeyTemplateLoginName(summary))
                            : journeyProfileNameChip(UILANG.m('Login'), summary.loginName)}
                        ${summary.loginTemplate === 'cloned'
                            ? journeyProfileNameChip(UILANG.m('Dataset'), summary.loginName)
                            : journeyProfileNameChip(UILANG.m('Display name'), displayName)}
                        ${summary.loginTemplate === 'cloned'
                            ? journeyProfileNameChip(UILANG.m('Display name'), displayName)
                            : ''}
                        ${journeyProfileRunChip(summary)}
                        ${journeyMetaTagsHtml(summary.info)}
                    </div>
                </div>
                <div class="journeyProfileStatus ${connection.className}">
                    <i></i>
                    <strong>${journeyEsc(connection.label)}</strong>
                    ${connection.detail ? `<em>${journeyEsc(journeyFormatProfileTimestamp(connection.detail) || connection.detail)}</em>` : ''}
                </div>
            </div>
            <div class="journeyProfileBody">
                <div class="journeyProfileCharts">${chartHtml}</div>
                <div class="journeyProfileGroups">${detailHtml}</div>
            </div>
        </section>
    `;
}

function journeyPageStatsHtml(pageStats) {
    if (!pageStats.length) return '';
    const totalTime = journeyTotalPageTime(pageStats);
    const rows = pageStats.map((page) => /* html */`
        <tr class="journeyPageRow" data-page="${journeyEsc(page.itemId)}">
            <td>${journeyPageTitleHtml(page)}</td>
            <td>${journeyEsc(page.code || '')}</td>
            <td>${Number(page.visits || 0)}</td>
            <td>${journeyEsc(page.timeSpentLabel || '')}</td>
            <td>${Number(page.answerEvents || 0)}</td>
            <td>${Number(page.finalAnswerCount || 0)}</td>
            <td>${journeyEsc(page.firstEvent || '')}</td>
            <td>${journeyEsc(page.lastEvent || '')}</td>
        </tr>
    `).join('');

    return /* html */`
        <section class="journeyBand">
            <div class="journeySectionHead">
                <h3>${UILANG.m('Page Journey')}</h3>
                <span>${UILANG.m('Total time')}: ${journeyEsc(totalTime.label)}</span>
            </div>
            <div class="journeyTableFrame">
                <table class="journeyTable">
                    <thead><tr>
                        <th>${UILANG.m('Page')}</th>
                        <th>${UILANG.m('Code')}</th>
                        <th>${UILANG.m('Visits')}</th>
                        <th>${UILANG.m('Time')}</th>
                        <th>${UILANG.m('Answer events')}</th>
                        <th>${UILANG.m('Final answers')}</th>
                        <th>${UILANG.m('First event')}</th>
                        <th>${UILANG.m('Last event')}</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </section>
    `;
}

function journeyPageTitleHtml(page) {
    const stimulusDetails = [];
    if (page.isStimulus) stimulusDetails.push(`<span class="journeyStimulusBadge">${UILANG.m('Stimulus page')}</span>`);
    if (page.linkedStimulusId) {
        const label = page.linkedStimulusName
            ? `${UILANG.m('Uses stimulus')}: ${page.linkedStimulusName}`
            : `${UILANG.m('Uses stimulus')} #${page.linkedStimulusId}`;
        stimulusDetails.push(`<span class="journeyStimulusBadge journeyStimulusBadgeLinked">${journeyEsc(label)}</span>`);
    }
    return /* html */`
        <strong>${journeyEsc(page.name || page.itemId)}</strong>
        ${stimulusDetails.join('')}
    `;
}

function journeyPageDetailHtml(data) {
    const pages = data.pages || [];
    if (!pages.length) return '';
    const blocks = pages.map((page) => {
        const finalAnswers = data.finalAnswers?.[page.id] || {};
        const history = data.answerHistory?.[page.id] || {};
        const interactions = journeyBuildInteractions(page, finalAnswers, history, data.timeline || []);
        const interactionCards = interactions.map((interaction, idx) => {
            const field = interaction.field || interaction.fields?.[0] || {};
            const answerHtml = journeyInteractionAnswersHtml(interaction);
            const stepCount = (interaction.answers || []).reduce((sum, answer) => sum + (answer.revisions?.length || 0), 0);
            const sidePanelHtml = journeyInteractionSidePanelHtml(interaction, answerHtml, stepCount);
            const stimulusBadge = interaction.isStimulus ? ` <span class="journeyStimulusBadge">${UILANG.m('From stimulus page')}</span>` : '';
            const mismatchHtml = journeyStructureMismatchWarningHtml(interaction);
            return /* html */`
                <article class="journeyInteractionCard${interaction.structureMismatch ? ' journeyStructureMismatchCard' : ''}">
                    <div class="journeyInteractionHead">
                        <div>
                            <span>${journeyEsc(interaction.kind === 'media' ? UILANG.m('Media') : UILANG.m('Interaction'))} ${idx + 1}${stimulusBadge}</span>
                            <strong>${journeyEsc(interaction.title || field.id || UILANG.m('Content'))}</strong>
                        </div>
                        <em>${journeyEsc(field.type || interaction.type || '')}${field.processing ? ' / ' + journeyEsc(field.processing) : ''}${field.required ? ' / ' + UILANG.m('required') : ''}</em>
                    </div>
                    ${mismatchHtml}
                    ${journeyInteractionPreviewHtml(interaction, idx)}
                    ${sidePanelHtml}
                </article>
            `;
        }).join('');
        return /* html */`
            <article class="journeyPageDetail" id="journeyPage_${journeyEsc(page.id)}">
                <div class="journeyPageHeader">
                    <div>
                        <strong>${journeyEsc(page.name || page.id)}</strong>
                        <div class="journeyStimulusBadgeRow">${journeyPageStimulusBadgesHtml(page)}</div>
                    </div>
                    <span>${journeyEsc(page.code || '')} / ${page.id}</span>
                </div>
                <div class="journeyInteractionStack">
                    ${interactionCards || `<div class="journeyMuted">${UILANG.m('No interactions found for this page.')}</div>`}
                </div>
            </article>
        `;
    }).join('');

    return /* html */`
        <section class="journeyBand">
            <h3>${UILANG.m('Item View')}</h3>
            <div class="journeyPageStack">${blocks}</div>
        </section>
    `;
}

function journeyPageStimulusBadgesHtml(page) {
    const badges = [];
    if (page.isStimulus) badges.push(`<span class="journeyStimulusBadge">${UILANG.m('Stimulus page')}</span>`);
    if (page.linkedStimulusId) {
        const label = page.linkedStimulusName
            ? `${UILANG.m('Uses stimulus')}: ${page.linkedStimulusName}`
            : `${UILANG.m('Uses stimulus')} #${page.linkedStimulusId}`;
        badges.push(`<span class="journeyStimulusBadge journeyStimulusBadgeLinked">${journeyEsc(label)}</span>`);
    }
    return badges.join('');
}

function journeyBuildInteractions(page, finalAnswers, history, timeline = []) {
    const content = page.content || [];
    const fields = page.fields || [];
    const interactions = [];
    const usedFields = new Set();
    const structureMismatchFields = page.structureMismatchFields || [];
    const structureMismatchFieldIds = new Set(structureMismatchFields.map((entry) => String(entry.fieldId || '')).filter(Boolean));
    const interactionHasStructureMismatch = (interactionFields) => {
        return (interactionFields || []).some((field) => structureMismatchFieldIds.has(String(field.id || '')));
    };

    content.forEach((block) => {
        const blockFields = fields.filter((field) => {
            if (usedFields.has(field.id)) return false;
            return journeyFieldBelongsToBlock(field, block);
        });
        blockFields.forEach((field) => usedFields.add(field.id));
        const actionEvents = journeyActionEventsForInteraction(page, block, timeline);
        const answerFields = blockFields.length > 0 ? blockFields : journeySyntheticFieldsForBlock(block, finalAnswers, history, usedFields);
        const kind = journeyIsMediaBlock(block, answerFields) ? 'media' : (answerFields.length === 0 && actionEvents.length === 0 ? 'content' : 'answer');
        answerFields.forEach((field) => usedFields.add(field.id));

        interactions.push(journeyCreateInteraction({
            kind,
            title: block.id || block.type,
            type: block.type,
            prompt: block.text,
            preview: block.preview || null,
            fields: answerFields,
            finalAnswers,
            history,
            actionEvents,
            mediaActivity: journeyMediaActivityForInteraction(page, block, answerFields, finalAnswers, history, timeline),
            isStimulus: !!page.isStimulus,
            structureMismatch: interactionHasStructureMismatch(answerFields),
            structureMismatchFields
        }));
    });

    const groupedRemainders = {};
    fields.forEach((field) => {
        if (usedFields.has(field.id)) return;
        const root = journeyFieldGroupRoot(field.id);
        if (!groupedRemainders[root]) groupedRemainders[root] = [];
        groupedRemainders[root].push(field);
        usedFields.add(field.id);
    });

    Object.entries(groupedRemainders).forEach(([root, groupFields]) => {
        const kind = journeyFieldsAreMedia(groupFields) ? 'media' : 'answer';
        interactions.push(journeyCreateInteraction({
            kind,
            title: root,
            type: groupFields[0]?.type || '',
            prompt: groupFields.map((field) => field.label).filter(Boolean).join(' / '),
            preview: null,
            fields: groupFields,
            finalAnswers,
            history,
            actionEvents: [],
            mediaActivity: journeyMediaActivityForInteraction(page, null, groupFields, finalAnswers, history, timeline),
            isStimulus: !!page.isStimulus,
            structureMismatch: interactionHasStructureMismatch(groupFields),
            structureMismatchFields
        }));
    });

    Object.keys(finalAnswers || {}).forEach((fieldId) => {
        if (usedFields.has(fieldId)) return;
        const field = { id: fieldId, type: finalAnswers[fieldId]?.fieldType || '' };
        const kind = journeyIsMediaType(field.type) ? 'media' : 'answer';
        interactions.push(journeyCreateInteraction({
            kind,
            title: fieldId,
            type: field.type,
            prompt: '',
            preview: null,
            fields: [field],
            finalAnswers,
            history,
            actionEvents: [],
            mediaActivity: journeyMediaActivityForInteraction(page, null, [field], finalAnswers, history, timeline),
            isStimulus: !!page.isStimulus,
            structureMismatch: page.structureMismatch || structureMismatchFieldIds.has(String(fieldId)),
            structureMismatchFields
        }));
        usedFields.add(fieldId);
    });

    Object.keys(history || {}).forEach((fieldId) => {
        if (usedFields.has(fieldId) || Object.prototype.hasOwnProperty.call(finalAnswers || {}, fieldId)) return;
        const field = { id: fieldId, type: history[fieldId]?.[0]?.fieldType || '' };
        const kind = journeyIsMediaType(field.type) ? 'media' : 'answer';
        interactions.push(journeyCreateInteraction({
            kind,
            title: fieldId,
            type: field.type,
            prompt: '',
            preview: null,
            fields: [field],
            finalAnswers,
            history,
            actionEvents: [],
            mediaActivity: journeyMediaActivityForInteraction(page, null, [field], finalAnswers, history, timeline),
            isStimulus: !!page.isStimulus,
            structureMismatch: page.structureMismatch || structureMismatchFieldIds.has(String(fieldId)),
            structureMismatchFields
        }));
    });

    return interactions;
}

function journeyTotalPageTime(pageStats) {
    const seconds = (pageStats || []).reduce((sum, page) => sum + Number(page.timeSpent || 0), 0);
    return {
        seconds,
        label: journeyFormatSeconds(seconds)
    };
}

function journeyCreateInteraction({ kind = 'answer', title, type, prompt, preview, fields, finalAnswers, history, actionEvents = [], mediaActivity = null, isStimulus = false, structureMismatch = false, structureMismatchFields = [] }) {
    const cleanFields = fields || [];
    const answers = cleanFields.map((field) => ({
        field,
        finalAnswer: finalAnswers?.[field.id],
        revisions: history?.[field.id] || []
    })).filter((answer) => {
        const hasFinal = answer.finalAnswer && journeyHasAnswerValue(answer.finalAnswer.value);
        const hasRevision = answer.revisions.some((rev) => journeyHasAnswerValue(rev.value));
        if (kind === 'media') return hasFinal || hasRevision;
        return hasFinal || hasRevision;
    });

    return {
        kind,
        title,
        type,
        prompt,
        preview,
        fields: cleanFields,
        field: cleanFields[0] || null,
        answers,
        actionEvents,
        mediaActivity,
        isStimulus,
        structureMismatch,
        structureMismatchFields
    };
}

function journeyStructureMismatchWarningHtml(interaction) {
    if (!interaction?.structureMismatch) return '';
    return /* html */`
        <div class="journeyIntegrityWarning">
            <div class="journeyIntegrityWarningIcon">!</div>
            <div class="journeyIntegrityWarningText">
                <strong>${UILANG.m('Question structure mismatch')}</strong>
                <span>${UILANG.m('Please note that an inconsistency has been detected between the answers given by this test taker and the current question structure.')}</span>
                <em>${UILANG.m('This test page may have been modified after test taker responses were recorded.')}</em>
            </div>
        </div>
    `;
}

function journeyActionEventsForInteraction(page, block, timeline) {
    const type = String(block?.type || block?.preview?.type || '').toLowerCase();
    if (type !== 'button') return [];

    return (timeline || []).filter((event) => {
        return String(event.itemId) === String(page.id) && event.subType === 'endTest';
    }).map((event) => ({
        eventId: event.eventId,
        tsClient: event.tsClient,
        label: UILANG.m('Close test action triggered'),
        detail: UILANG.m('The saved behaviour event is endTest on this page.')
    }));
}

function journeySyntheticFieldsForBlock(block, finalAnswers, history, usedFields) {
    if (journeyIsMediaBlock(block)) return [];
    const ids = [...Object.keys(finalAnswers || {}), ...Object.keys(history || {})]
        .filter((fieldId, idx, arr) => arr.indexOf(fieldId) === idx)
        .filter((fieldId) => !usedFields.has(fieldId))
        .filter((fieldId) => journeyFieldBelongsToBlock({ id: fieldId }, block));
    return ids.map((fieldId) => ({
        id: fieldId,
        type: finalAnswers?.[fieldId]?.fieldType || history?.[fieldId]?.[0]?.fieldType || ''
    })).filter((field) => !journeyIsMediaType(field.type));
}

function journeyFieldBelongsToBlock(field, block) {
    const fieldId = String(field?.id || '');
    const blockId = String(block?.id || block?.preview?.id || '');
    if (fieldId === '') return false;
    if (Array.isArray(block?.fieldIds) && block.fieldIds.some((id) => String(id) === fieldId)) return true;
    if (journeyLegacyBlockReferencesField(block, fieldId)) return true;
    if (blockId === '') return false;
    if (fieldId === blockId) return true;
    if (fieldId.startsWith(`${blockId}_`) || fieldId.startsWith(`${blockId}__`) || fieldId.startsWith(`${blockId}.`) || fieldId.startsWith(`${blockId}-`)) return true;
    if (journeyPreviewHasExactValue(block.preview, fieldId)) return true;
    return false;
}

function journeyLegacyBlockReferencesField(block, fieldId) {
    const source = journeyBlockSourceText(block);
    if (!source) return false;

    const compiledIds = [...source.matchAll(/data-id=['"]([a-f0-9]+)['"]/gi)]
        .map((match) => journeyHexToText(match[1]))
        .filter(Boolean);
    if (compiledIds.includes(fieldId)) return true;

    if (!journeyIsLegacyTaggedSource(source)) return false;
    const escapedField = journeyRegexEscape(fieldId);
    const legacyIdPattern = new RegExp(`\\b(?:GROUP|ID)\\s*=\\s*["']${escapedField}["']`, 'i');
    return legacyIdPattern.test(source);
}

function journeyBlockSourceText(block, lang = '') {
    const preview = block?.preview || block || {};
    const source = preview.source || preview.text || preview.question || '';
    if (typeof source === 'string') return source;
    if (source && typeof source === 'object') {
        const langKey = journeyLocalizedKey(source, lang);
        if (langKey && typeof source[langKey] === 'string') return source[langKey];
        return Object.values(source).filter((value) => typeof value === 'string').join('\n');
    }
    return '';
}

function journeyIsLegacyTaggedSource(source) {
    return /\[@(?:CB|RB|DD|TF|TA|DG|DZ|SLIKERT|BUTTON|AUDIO|VIDEO)\b/i.test(String(source || ''));
}

function journeyRegexEscape(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function journeyHexToText(value) {
    try {
        if (!value || value.length % 2 !== 0) return '';
        return value.match(/.{1,2}/g).map((hex) => String.fromCharCode(parseInt(hex, 16))).join('');
    } catch (_e) {
        return '';
    }
}

function journeyPreviewHasExactValue(value, needle) {
    if (value === null || typeof value === 'undefined') return false;
    if (typeof value !== 'object') return String(value) === needle;
    return Object.values(value).some((entry) => journeyPreviewHasExactValue(entry, needle));
}

function journeyFieldGroupRoot(fieldId) {
    fieldId = String(fieldId || '');
    return fieldId
        .replace(/(__?tf\d+|__?textfield\d*)$/i, '')
        .replace(/(_row_\d+|__row_\d+)$/i, '')
        .replace(/(_col_\d+|__col_\d+)$/i, '') || fieldId;
}

function journeyInteractionPreviewHtml(interaction, idx) {
    const preview = interaction.preview;
    if (!preview) return journeyPromptFallbackHtml(interaction);
    if (preview.type === 'conceptmap') return journeyConceptMapPreviewHtml(interaction, preview, idx);
    const lang = journeyPreviewLang(preview, interaction);
    const blockSource = journeyBlockSourceText(preview, lang);
    if (journeyIsAdvancedContentBlock(preview) && (journeyIsLegacyTaggedSource(blockSource) || journeyIsLegacyTaggedSource(journeyBlockSourceText(preview)))) {
        return journeyLegacyAdvancedPreviewHtml(interaction, preview);
    }
    if (typeof EditorFactory === 'undefined') return journeyIsMediaBlock({ preview }) ? journeyMediaPreviewHtml(interaction, preview) : journeyPromptFallbackHtml(interaction);

    try {
        if (journeyPreviewFactory === null) journeyPreviewFactory = new EditorFactory();
        const editor = journeyPreviewFactory.getEditorClass(preview.type);
        if (!editor || typeof editor.generatePreview !== 'function' || lang === '') {
            return journeyIsMediaBlock({ preview }) ? journeyMediaPreviewHtml(interaction, preview) : journeyPromptFallbackHtml(interaction);
        }

        let html = editor.generatePreview(preview, lang, { maxWidth: 760, skipShuffling: true });
        if (String(html || '').trim() === '' && journeyIsMediaBlock({ preview })) return journeyMediaPreviewHtml(interaction, preview);
        const wrapper = $('<div class="journeyGeneratedPreview"></div>').html(html);

        if ((interaction.answers || []).length > 0 && typeof Scoring !== 'undefined') {
            if (journeyPreviewScoring === null) journeyPreviewScoring = new Scoring();
            (interaction.answers || []).forEach((answer, answerIdx) => {
                if (!answer.finalAnswer) return;
                const fieldId = answer.field?.id || interaction.title || '';
                journeyPreviewScoring.decorateResponsePreview(wrapper, answer.finalAnswer.value, preview, fieldId, answerIdx, lang);
            });
            wrapper.find('input, textarea').each(function() {
                const value = $(this).val();
                if ($(this).is('textarea')) {
                    $(this).text(value);
                } else {
                    $(this).attr('value', value);
                }
            });
            journeyGrowPreviewFields(wrapper);
        }

        return `<div class="journeyPromptPreview">${wrapper.prop('outerHTML')}</div>`;
    } catch (_e) {
        return journeyIsMediaBlock({ preview }) ? journeyMediaPreviewHtml(interaction, preview) : journeyPromptFallbackHtml(interaction);
    }
}

function journeyMediaPreviewHtml(interaction, preview) {
    const lang = journeyPreviewLang(preview, interaction);
    const fileId = journeyLocalizedPreviewValue(preview.fileid, lang);
    const checksum = journeyLocalizedPreviewValue(preview.filechecksum, lang);
    const filename = journeyLocalizedPreviewValue(preview.filename, lang) || interaction.title || '';
    if (!fileId) {
        return /* html */`
            <div class="journeyPromptBox">
                <span>${journeyEsc(journeyMediaKindLabel(preview.type))}</span>
                <p>${journeyEsc(filename || UILANG.m('No media file found.'))}</p>
            </div>
        `;
    }
    const root = (typeof settings !== 'undefined' && settings.JSrootURL) ? settings.JSrootURL : '';
    const src = `${root}fetchMediaFile.php?fileid=${encodeURIComponent(fileId)}${checksum ? `&checksum=${encodeURIComponent(checksum)}` : ''}`;
    const type = String(preview.type || '').toLowerCase();
    let mediaHtml = '';
    if (type.includes('image')) {
        const width = journeyLocalizedPreviewValue(preview.width, lang);
        const align = preview.align || 'left';
        const cssWidth = width && !Number.isNaN(Number(width)) ? `${Number(width)}px` : (width || 'auto');
        mediaHtml = `<div class="journeyMediaPreviewImage" style="text-align:${journeyEsc(align)}"><img src="${journeyEsc(src)}" alt="${journeyEsc(filename)}" style="max-width:100%; width:${journeyEsc(cssWidth)};"></div>`;
    } else if (type.includes('audio')) {
        mediaHtml = `<audio controls src="${journeyEsc(src)}"></audio>`;
    } else {
        mediaHtml = `<video controls src="${journeyEsc(src)}"></video>`;
    }
    return /* html */`
        <div class="journeyPromptPreview journeyMediaPreview">
            ${filename ? `<div class="journeyMediaPreviewName">${journeyEsc(filename)}</div>` : ''}
            ${mediaHtml}
        </div>
    `;
}

function journeyLocalizedPreviewValue(value, lang) {
    if (value === null || typeof value === 'undefined') return '';
    if (typeof value === 'object') {
        const langKey = journeyLocalizedKey(value, lang);
        if (langKey && typeof value[langKey] !== 'undefined') return value[langKey];
        const firstKey = Object.keys(value)[0];
        return firstKey ? value[firstKey] : '';
    }
    return value;
}

function journeyIsAdvancedContentBlock(preview) {
    const type = String(preview?.type || '').toLowerCase();
    return type === 'advanced' || type === 'wysiwyg';
}

function journeyLegacyAdvancedPreviewHtml(interaction, preview) {
    const lang = journeyPreviewLang(preview, interaction);
    const source = journeyBlockSourceText(preview, lang);
    const originalCode = journeyOriginalLegacySource(source);
    const interpretedCount = (interaction.fields || []).length;
    return /* html */`
        <div class="journeyPromptBox journeyLegacyPromptBox">
            <span>${UILANG.m('Legacy advanced content')}</span>
            <p>${journeyEsc(originalCode || interaction.prompt || UILANG.m('Legacy fields were detected in this block.'))}</p>
            <div class="journeyMediaNote">
                ${interpretedCount > 0
                    ? `${interpretedCount} ${UILANG.m(interpretedCount === 1 ? 'interpreted field' : 'interpreted fields')}`
                    : UILANG.m('No recorded answer field was linked to this legacy block.')}
            </div>
        </div>
    `;
}

function journeyOriginalLegacySource(source) {
    let text = String(source || '');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n');
    text = text.replace(/<\/(td|th)>/gi, '\t');
    text = $('<div></div>').html(text).text();
    text = text.replace(/\u00a0/g, ' ');
    text = text.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return text.length > 1400 ? text.substring(0, 1397) + '...' : text;
}

function journeyConceptMapPreviewHtml(interaction, preview, idx) {
    const originalKey = journeyStoreConceptMapData(preview.conceptmap || null);
    return /* html */`
        <div class="journeyPromptBox">
            <span>${UILANG.m('Concept map')}</span>
            <p>${journeyEsc(interaction.prompt || UILANG.m('Concept map response'))}</p>
            <div class="journeyConceptMapActions">
                ${originalKey ? `<button type="button" class="journeyConceptMapBtn" data-cmkey="${journeyEsc(originalKey)}" data-question="${journeyEsc(interaction.prompt || '')}">${UILANG.m('Open original map')}</button>` : ''}
            </div>
        </div>
    `;
}

function journeyStoreConceptMapData(data) {
    if (data === null || typeof data === 'undefined' || data === '') return null;
    const key = `cm_${Object.keys(journeyConceptMapStore).length}_${Date.now()}`;
    const decoded = journeyDecodeValue(data);
    journeyConceptMapStore[key] = typeof decoded === 'string' ? decoded : JSON.stringify(decoded);
    return key;
}

function journeyOpenConceptMap(dataKey, question = '') {
    const data = journeyConceptMapStore[dataKey];
    if (!data) return;
    openExternalEditor({
        url: '../apps/conceptmaps/',
        data,
        question
    });
}

function journeyGrowPreviewFields(wrapper) {
    wrapper.find('input, textarea, .msResponseFilledField, .msResponseTextarea').each(function() {
        const $field = $(this);
        const value = String($field.is('input, textarea') ? ($field.val() || $field.text()) : $field.text());
        const length = String(value || '').length;
        if (length === 0) return;
        const longestLine = value.split(/\r\n|\r|\n/).reduce((max, line) => Math.max(max, line.length), 0);
        const isInlineField = $field.hasClass('previewTag_inlineText') || $field.hasClass('previewTag_inlineGap');
        const width = isInlineField
            ? `calc(${Math.max(4, Math.min(64, longestLine + 1))}ch + 12px)`
            : `calc(${Math.max(12, Math.min(140, longestLine + 6))}ch + 18px)`;
        if ($field.is('textarea')) {
            const rows = value.split(/\r\n|\r|\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(Math.max(1, line.length) / 72)), 0);
            const height = `${Math.max(64, rows * 24 + 18)}px`;
            $field
                .val(value)
                .text(value)
                .attr('rows', Math.max(2, rows))
                .css({
                    width: '100%',
                    minWidth: '100%',
                    maxWidth: '100%',
                    minHeight: height,
                    height,
                    overflow: 'visible',
                    whiteSpace: 'pre-wrap'
                });
            return;
        }
        $field.css({
            width,
            minWidth: width,
            maxWidth: 'none',
            whiteSpace: 'nowrap',
            ...(isInlineField ? { margin: '0 6px 4px' } : {})
        });
    });
}

function journeyPreviewLangSource(preview) {
    return preview.question || preview.source || preview.label || preview.text || preview.filename || preview.fileid || null;
}

function journeyInteractionAnswerLang(interaction) {
    const answers = interaction?.answers || [];
    for (const answer of answers) {
        if (answer?.finalAnswer?.language) return answer.finalAnswer.language;
    }
    for (const answer of answers) {
        const revision = (answer?.revisions || []).find((entry) => entry?.language);
        if (revision?.language) return revision.language;
    }
    return '';
}

function journeyPreviewLang(preview, interaction = null) {
    const langSource = journeyPreviewLangSource(preview);
    if (langSource && typeof langSource === 'object') {
        const answerLang = journeyInteractionAnswerLang(interaction);
        const answerLangKey = journeyLocalizedKey(langSource, answerLang);
        if (answerLangKey) return answerLangKey;
        const preferred = (typeof getBackendLanguage === 'function') ? getBackendLanguage() : null;
        const preferredKey = journeyLocalizedKey(langSource, preferred);
        if (preferredKey) return preferredKey;
        return Object.keys(langSource)[0] || '';
    }
    return '';
}

function journeyLocalizedKey(localizedValue, lang) {
    if (!localizedValue || typeof localizedValue !== 'object' || !lang) return '';
    if (typeof localizedValue[lang] !== 'undefined') return lang;
    const normalizedLang = journeyNormalizeLangKey(lang);
    const keys = Object.keys(localizedValue);
    return keys.find((key) => journeyNormalizeLangKey(key) === normalizedLang)
        || keys.find((key) => {
            const normalizedKey = journeyNormalizeLangKey(key);
            return normalizedKey.startsWith(`${normalizedLang}_`) || normalizedLang.startsWith(`${normalizedKey}_`);
        })
        || '';
}

function journeyNormalizeLangKey(lang) {
    return String(lang || '').trim().replace('-', '_').toLowerCase();
}

function journeyPromptFallbackHtml(interaction) {
    return /* html */`
        <div class="journeyPromptBox">
            <span>${journeyEsc(interaction.type || UILANG.m('Prompt'))}</span>
            <p>${journeyEsc(interaction.prompt || UILANG.m('No readable prompt text found.'))}</p>
        </div>
    `;
}

function journeyInteractionSidePanelHtml(interaction, answerHtml, stepCount) {
    if (interaction.kind === 'media') return journeyMediaActivityHtml(interaction);
    if (interaction.kind === 'content') {
        return /* html */`
            <div class="journeyAnswerBox journeyMediaBox">
                <div class="journeyAnswerHead">
                    <strong>${UILANG.m('Content')}</strong>
                    <span>${UILANG.m('No recorded answer')}</span>
                </div>
                <div class="journeyMediaNote">${UILANG.m('No recorded answer was found for this block.')}</div>
            </div>
        `;
    }
    return /* html */`
        <div class="journeyAnswerBox">
            <div class="journeyAnswerHead">
                <strong>${UILANG.m('Test taker answer')}</strong>
                <span>${stepCount} ${UILANG.m('steps')}</span>
            </div>
            ${answerHtml || `<div class="journeyFinalAnswer">${UILANG.m('No final answer recorded.')}</div>`}
        </div>
    `;
}

function journeyMediaActivityHtml(interaction) {
    const activity = interaction.mediaActivity || {};
    const mediaType = journeyMediaKindLabel(activity.mediaType || interaction.type || interaction.field?.type);
    const isImage = String(activity.mediaType || interaction.type || '').toLowerCase().includes('image');
    const hasStoredPlayCount = activity.playCount !== null && typeof activity.playCount !== 'undefined';
    const playCountLabel = hasStoredPlayCount ? UILANG.m('Stored play count') : UILANG.m('Full plays');
    const playCount = hasStoredPlayCount ? activity.playCount : Number(activity.ended || 0);
    const played = Number(activity.playCount || 0) > 0 || Number(activity.started || 0) > 0 || Number(activity.ended || 0) > 0;
    const historyHtml = journeyMediaHistoryHtml(activity.playHistory || []);

    return /* html */`
        <div class="journeyAnswerBox journeyMediaBox">
            <div class="journeyAnswerHead">
                <strong>${UILANG.m('Media activity')}</strong>
                <span>${journeyEsc(mediaType)}</span>
            </div>
            <div class="journeyMediaStats">
                <span><strong>${UILANG.m('Played')}</strong><em>${played ? UILANG.m('yes') : UILANG.m('no')}</em></span>
                ${isImage ? `<span><strong>${UILANG.m('Tracking')}</strong><em>${UILANG.m('not available')}</em></span>` : `<span><strong>${journeyEsc(playCountLabel)}</strong><em>${journeyEsc(playCount)}</em></span>`}
                <span><strong>${UILANG.m('Started')}</strong><em>${Number(activity.started || 0)}</em></span>
                <span><strong>${UILANG.m('Paused')}</strong><em>${Number(activity.paused || 0)}</em></span>
                <span><strong>${UILANG.m('Ended')}</strong><em>${Number(activity.ended || 0)}</em></span>
            </div>
            ${activity.lastEvent ? `<div class="journeyMediaNote">${UILANG.m('Last media event')}: ${journeyEsc(activity.lastEvent)}</div>` : ''}
            ${isImage ? `<div class="journeyMediaNote">${UILANG.m('Images do not store answer or playback information.')}</div>` : ''}
            ${historyHtml}
        </div>
    `;
}

function journeyMediaHistoryHtml(history) {
    if (!Array.isArray(history) || history.length === 0) return '';
    const rows = history.map((entry, idx) => /* html */`
        <li class="is-change">
            <span>${UILANG.m('Step')} ${idx + 1}</span>
            <strong>${UILANG.m('Play count')}: ${journeyEsc(entry.value)}</strong>
            <em>#${Number(entry.eventId || 0)} / ${journeyEsc(entry.tsClient || '')}</em>
        </li>
    `).join('');
    return /* html */`
        <details class="journeyAnswerHistory">
            <summary>${UILANG.m('Play count history')} / ${history.length} ${UILANG.m('steps')}</summary>
            <ol>${rows}</ol>
        </details>
    `;
}

function journeyMediaActivityForInteraction(page, block, fields, finalAnswers, history, timeline) {
    const mediaType = journeyMediaType(block, fields);
    const playHistory = [];
    let playCount = null;

    (fields || []).forEach((field) => {
        const finalAnswer = finalAnswers?.[field.id];
        const revisions = history?.[field.id] || [];
        revisions.forEach((rev) => {
            if (!journeyIsNumericValue(rev.value)) return;
            playHistory.push({
                eventId: rev.eventId,
                tsClient: rev.tsClient,
                value: Number(rev.value)
            });
        });
        if (finalAnswer && journeyIsNumericValue(finalAnswer.value)) {
            playCount = Math.max(Number(finalAnswer.value), Number(playCount || 0));
        } else if (revisions.length > 0) {
            const lastNumeric = [...revisions].reverse().find((rev) => journeyIsNumericValue(rev.value));
            if (lastNumeric) playCount = Math.max(Number(lastNumeric.value), Number(playCount || 0));
        }
    });

    const mediaEvents = (timeline || []).filter((event) => {
        return String(event.itemId) === String(page.id) && journeyIsMediaEvent(event.subType);
    });

    return {
        mediaType,
        playCount,
        playHistory,
        started: mediaEvents.filter((event) => event.subType === 'startPlayback').length,
        paused: mediaEvents.filter((event) => event.subType === 'pausePlayback').length,
        ended: mediaEvents.filter((event) => event.subType === 'endPlayback' || event.subType === 'playbackEnded').length,
        lastEvent: mediaEvents.length ? mediaEvents[mediaEvents.length - 1].tsClient : ''
    };
}

function journeyIsMediaBlock(block, fields = []) {
    return journeyIsMediaType(block?.type) || journeyIsMediaType(block?.preview?.type) || journeyFieldsAreMedia(fields);
}

function journeyFieldsAreMedia(fields = []) {
    return (fields || []).some((field) => journeyIsMediaType(field.type));
}

function journeyIsMediaType(type) {
    type = String(type || '').toLowerCase();
    return ['audio', 'video', 'image'].some((needle) => type.includes(needle));
}

function journeyMediaType(block, fields = []) {
    const candidates = [block?.preview?.mediaType, block?.preview?.type, block?.type, ...(fields || []).map((field) => field.type)];
    return candidates.find((value) => journeyIsMediaType(value)) || '';
}

function journeyMediaKindLabel(type) {
    type = String(type || '').toLowerCase();
    if (type.includes('video')) return UILANG.m('Video');
    if (type.includes('audio')) return UILANG.m('Audio');
    if (type.includes('image')) return UILANG.m('Image');
    return UILANG.m('Media');
}

function journeyIsMediaEvent(subType) {
    return ['startPlayback', 'pausePlayback', 'endPlayback', 'playbackEnded'].includes(String(subType || ''));
}

function journeyIsNumericValue(value) {
    return value !== null && value !== '' && !Number.isNaN(Number(value));
}

function journeyHasAnswerValue(value) {
    const decoded = journeyDecodeValue(value);
    if (decoded === null || typeof decoded === 'undefined') return false;
    if (Array.isArray(decoded)) return decoded.some((entry) => journeyHasAnswerValue(entry));
    if (typeof decoded === 'object') return Object.values(decoded).some((entry) => journeyHasAnswerValue(entry));
    return String(decoded).trim() !== '';
}

function journeyInteractionAnswersHtml(interaction) {
    const answers = interaction.answers || [];
    const actionEvents = interaction.actionEvents || [];
    const actionHtml = actionEvents.map((event) => /* html */`
        <div class="journeyActionEvent">
            <strong>${journeyEsc(event.label || UILANG.m('Action triggered'))}</strong>
            <span>#${Number(event.eventId || 0)} / ${journeyEsc(event.tsClient || '')}</span>
            ${event.detail ? `<em>${journeyEsc(event.detail)}</em>` : ''}
        </div>
    `).join('');
    if (answers.length === 0) return actionHtml;

    return answers.map((answer) => {
        const field = answer.field || {};
        const finalAnswer = answer.finalAnswer;
        const revisions = answer.revisions || [];
        const isConceptMap = interaction.preview?.type === 'conceptmap' || String(field.type || '').toLowerCase().includes('conceptmap');
        const answerKey = isConceptMap && finalAnswer ? journeyStoreConceptMapData(finalAnswer.value) : null;
        const answerLang = finalAnswer?.language || [...revisions].reverse().find((rev) => rev?.language)?.language || '';
        const metaHtml = journeyAnswerMetaHtml(answers.length > 1 ? field.id : '', answerLang);
        const finalHtml = answerKey
            ? `<button type="button" class="journeyConceptMapBtn" data-cmkey="${journeyEsc(answerKey)}" data-question="${journeyEsc(interaction.prompt || '')}">${UILANG.m('Open answer map')}</button>`
            : journeyEsc(finalAnswer ? journeyInteractionAnswerValue(interaction, finalAnswer.value) : UILANG.m('No final answer recorded.'));
        const historyHtml = journeyAnswerHistoryHtml(revisions, finalAnswer, isConceptMap, interaction.prompt || '', interaction);

        return /* html */`
            <div class="journeyAnswerUnit">
                ${metaHtml}
                <div class="journeyFinalAnswer">${finalHtml}</div>
                ${historyHtml}
            </div>
        `;
    }).join('') + actionHtml;
}

function journeyAnswerMetaHtml(fieldId, language) {
    const parts = [];
    if (fieldId) parts.push(`<span class="journeyAnswerField">${journeyEsc(fieldId)}</span>`);
    if (language) parts.push(`<span class="journeyAnswerLang">${UILANG.m('Answer language')}: ${journeyEsc(language)}</span>`);
    return parts.length ? `<div class="journeyAnswerMeta">${parts.join('')}</div>` : '';
}

function journeyAnswerHistoryHtml(revisions, finalAnswer, isConceptMap, question = '', interaction = null) {
    if (!Array.isArray(revisions) || revisions.length === 0) return '';
    const changes = journeyCountAnswerChanges(revisions);
    const rows = revisions.map((rev, idx) => {
        const previous = idx > 0 ? revisions[idx - 1].value : null;
        const changed = idx === 0 || !journeyValuesEqual(previous, rev.value);
        const final = finalAnswer && journeyValuesEqual(finalAnswer.value, rev.value);
        const mapKey = isConceptMap ? journeyStoreConceptMapData(rev.value) : null;
        const valueHtml = mapKey
            ? `<button type="button" class="journeyConceptMapBtn" data-cmkey="${journeyEsc(mapKey)}" data-question="${journeyEsc(question)}">${UILANG.m('Open map snapshot')}</button>`
            : journeyEsc(journeyInteractionAnswerValue(interaction, rev.value));
        return /* html */`
            <li class="${changed ? 'is-change' : 'is-repeat'}">
                <span>${UILANG.m('Step')} ${idx + 1}</span>
                <strong>${valueHtml}</strong>
                <em>#${Number(rev.eventId || 0)} / ${journeyEsc(rev.tsClient || '')}${rev.language ? ' / ' + UILANG.m('Lang') + ': ' + journeyEsc(rev.language) : ''}${rev.editInProgress ? ' / ' + UILANG.m('draft') : ''}${final ? ' / ' + UILANG.m('final') : ''}${changed ? '' : ' / ' + UILANG.m('unchanged')}</em>
            </li>
        `;
    }).join('');
    return /* html */`
        <details class="journeyAnswerHistory">
            <summary>${UILANG.m('Answer history')} / ${revisions.length} ${UILANG.m('steps')} / ${changes} ${UILANG.m('changes')}</summary>
            <ol>${rows}</ol>
        </details>
    `;
}

function journeyInteractionAnswerValue(interaction, value) {
    const types = [interaction?.type, interaction?.preview?.type, interaction?.field?.type]
        .concat((interaction?.fields || []).map((field) => field?.type))
        .map((type) => String(type || '').toLowerCase());
    const decoded = journeyDecodeValue(value);
    if (types.some((type) => type.includes('slider')) && decoded !== '' && decoded !== null && typeof decoded !== 'object') {
        const numericValue = Number(decoded);
        if (Number.isFinite(numericValue)) {
            return Number.isInteger(numericValue) ? String(numericValue) : String(Math.round(numericValue * 100) / 100);
        }
    }
    return journeyShortValue(value);
}

function journeyCountAnswerChanges(revisions) {
    return (revisions || []).reduce((count, rev, idx) => {
        if (idx === 0) return count + 1;
        return journeyValuesEqual(revisions[idx - 1].value, rev.value) ? count : count + 1;
    }, 0);
}

function journeyValuesEqual(a, b) {
    return journeyStableValue(a) === journeyStableValue(b);
}

function journeyStableValue(value) {
    const decoded = journeyDecodeValue(value);
    if (decoded && typeof decoded === 'object') return JSON.stringify(decoded);
    return String(decoded ?? '');
}

function journeyAnswersHtml(finalAnswers, history) {
    const keys = new Set([...Object.keys(finalAnswers || {}), ...Object.keys(history || {})]);
    return Array.from(keys).map((fieldId) => {
        const finalAnswer = finalAnswers?.[fieldId];
        const revisions = history?.[fieldId] || [];
        const revHtml = revisions.map((rev) => /* html */`
            <li>
                <span>#${Number(rev.eventId || 0)} / ${journeyEsc(rev.tsClient || '')}</span>
                <strong>${journeyEsc(journeyShortValue(rev.value))}</strong>
            </li>
        `).join('');
        return /* html */`
            <div class="journeyAnswerBox">
                <div class="journeyAnswerHead"><strong>${journeyEsc(fieldId)}</strong><span>${revisions.length} ${UILANG.m('steps')}</span></div>
                <div class="journeyFinalAnswer">${journeyEsc(finalAnswer ? journeyShortValue(finalAnswer.value) : '')}</div>
                ${revHtml ? `<ol>${revHtml}</ol>` : ''}
            </div>
        `;
    }).join('');
}

function journeyConnectionState(summary, flags = {}) {
    const status = String(summary?.status || '');
    const localizedStatus = journeyLocalizedStatus(status);
    const lowerStatus = status.toLowerCase();
	const lifecycleTime = summary?.lifecycleTimestamp || summary?.tsActiveServer || '';
    if (lowerStatus.includes('submitted')) {
        return {
            label: localizedStatus,
            detail: lifecycleTime,
            className: 'is-submitted'
        };
    }
    if (lowerStatus.includes('offline') || lowerStatus.includes('connection lost')) {
        return {
            label: localizedStatus,
            detail: summary?.tsActiveServer || '',
            className: 'is-offline'
        };
    }
    if (lowerStatus.includes('active')) {
        return {
            label: localizedStatus,
            detail: summary?.tsActiveServer || '',
            className: 'is-online'
        }
    }
	if (lowerStatus.includes('left test') || lowerStatus.includes('window closed') || lowerStatus.includes('forced logout')) {
		return {label: localizedStatus, detail: lifecycleTime, className: 'is-aborted'};
	}
	if (lowerStatus.includes('reopened')) {
		return {label: localizedStatus, detail: lifecycleTime, className: 'is-open'};
	}
	if (lowerStatus === 'closed') {
		return {label: localizedStatus, detail: lifecycleTime, className: 'is-closed'};
	}
    return {
        label: localizedStatus || UILANG.m('Status unknown'),
        detail: lifecycleTime,
        className: journeyStatusClass(status)
    };
}

function journeyLocalizedStatus(status) {
    const key = String(status || '');
    switch (key) {
        case 'Submitted by user':
            return UILANG.m('Submitted by user');
        case 'Submitted no time left':
            return UILANG.m('Submitted no time left');
        case 'Active':
            return UILANG.m('Active');
        case 'Active no time limit':
            return UILANG.m('Active no time limit');
        case 'Offline / connection lost':
            return UILANG.m('Offline / connection lost');
        case 'Closed':
            return UILANG.m('Closed');
		case 'Left test':
			return UILANG.m('Left test');
		case 'Window closed':
			return UILANG.m('Window closed');
		case 'Forced logout':
			return UILANG.m('Forced logout');
		case 'Reopened - waiting for login':
			return UILANG.m('Reopened - waiting for login');
        default:
            return key;
    }
}

function journeyProfileProgressChart(summary) {
    if (summary.progress === null || typeof summary.progress === 'undefined' || summary.progress === '') return '';
    const progress = journeyClampPercent(summary.progress);
    return journeyProfileChartHtml(UILANG.m('Progress'), '', '', progress, '', journeyPercent(progress));
}

function journeyProfileTimeChart(summary) {
    if (summary.timeLeft === null || typeof summary.timeLeft === 'undefined' || summary.timeLeft === '') return '';
    const timeLeftRaw = summary.timeLeftRaw === null || typeof summary.timeLeftRaw === 'undefined' ? null : Number(summary.timeLeftRaw);
    const total = journeyProfileTimeTotal(summary);
    if (timeLeftRaw !== null && timeLeftRaw < 0) {
        return journeyProfileChartHtml(UILANG.m('Time left'), '', UILANG.m('No time limit'), 100, 'is-time is-open is-unlimited', '\u221e');
    }
    if (timeLeftRaw !== null && total > 0) {
        const remaining = Math.max(0, timeLeftRaw);
        const pct = journeyClampPercent((remaining / total) * 100);
        return journeyProfileChartHtml(
            UILANG.m('Time left'),
            '',
            '',
            pct,
            'is-time',
            summary.timeLeft
        );
    }
    if (timeLeftRaw !== null && timeLeftRaw === 0) {
        return journeyProfileChartHtml(UILANG.m('Time left'), '', '', 0, 'is-time', summary.timeLeft);
    }
    return journeyProfileChartHtml(UILANG.m('Time left'), summary.timeLeft, '', null, 'is-time');
}

function journeyProfilePointsChart(scoring) {
    if (scoring.achievedPoints === null || typeof scoring.achievedPoints === 'undefined' || scoring.possiblePoints === null || typeof scoring.possiblePoints === 'undefined') return '';
    const possible = Number(scoring.possiblePoints);
    const achieved = Number(scoring.achievedPoints);
    const pct = possible > 0 ? journeyClampPercent((achieved / possible) * 100) : null;
    const manualNote = journeyManualScoringNote(scoring);
    const manualClass = scoring.manualComplete === false ? ' is-pending' : (scoring.manualComplete === true ? ' is-complete' : '');
    return journeyProfileChartHtml(
        UILANG.m('Scored points'),
        '',
        journeyPointsLabel(scoring.achievedPoints, scoring.possiblePoints) + ' ' + UILANG.m('points'),
        pct,
        `is-points${manualClass}`,
        possible > 0 ? journeyPercent(pct) : '',
        manualNote
    );
}

function journeyProfileChartHtml(title, value, subline = '', percent = null, className = '', pieLabel = '', note = '') {
    const pieHtml = percent === null
        ? (String(className).includes('is-open') ? '<div class="journeyProfilePie journeyProfilePieEmpty"></div>' : '')
        : journeyProfilePie(percent, pieLabel);
    const textHtml = value || subline
        ? `<div class="journeyProfileChartText">
                ${value ? `<strong>${journeyEsc(value)}</strong>` : ''}
                ${subline ? `<em>${journeyEsc(subline)}</em>` : ''}
            </div>`
        : '';
    return /* html */`
        <div class="journeyProfileChart ${journeyEsc(className)}">
            <h4>${journeyEsc(title)}</h4>
            <div class="journeyProfileChartMain">
                ${pieHtml}
                ${textHtml}
                ${note ? `<div class="journeyProfileChartNote">${journeyEsc(note)}</div>` : ''}
            </div>
        </div>
    `;
}

function journeyProfilePie(percent, label = '') {
    const safePercent = journeyClampPercent(percent);
    const text = label || journeyPercent(safePercent);
    return `<div class="journeyProfilePie" style="--journey-profile-pie:${safePercent}%"><i>${journeyEsc(text)}</i></div>`;
}

function journeyProfileTimeTotal(summary) {
    const value = Number(summary.timeLeftAtLogin);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function journeyProfileTimelineGroup(summary, eventCounts = {}) {
    const rows = [
        journeyProfileInfoRow(UILANG.m('First login'), journeyFormatProfileTimestamp(summary.tsFirstLoginServer)),
        journeyProfileInfoRow(UILANG.m('Last login'), journeyFormatProfileTimestamp(summary.tsLoginServer)),
        journeyProfileInfoRow(UILANG.m('Last contact'), journeyFormatProfileTimestamp(summary.tsActiveServer))
    ].filter(Boolean).join('');
    const timelineButton = Number(eventCounts.total || 0) > 0
        ? `<a class="journeyLogAnchor" href="#journeyTimeline">${journeyEsc(UILANG.m('Jump to timeline'))} ↓</a>`
        : '';
    return journeyProfileInfoGroup(UILANG.m('Timestamps'), rows, timelineButton);
}

function journeyProfileActivityGroup(summary, flags, eventCounts, scoring) {
    const rows = [
        journeyProfileInfoRow(UILANG.m('Language switches'), Number(flags.languageSwitches || 0), Number(flags.languageSwitches || 0) > 0 ? 'is-alert' : ''),
        journeyProfileInfoRow(UILANG.m('Time up'), journeyYesNo(flags.timeUp), flags.timeUp ? 'is-alert' : ''),
        journeyProfileInfoRow(UILANG.m('Window closed'), journeyYesNo(flags.closedWindow), flags.closedWindow ? 'is-alert' : ''),
        scoring.available ? journeyProfileInfoRow(UILANG.m('Manual scoring complete'), journeyManualCompleteLabel(scoring), scoring.manualComplete ? 'is-ok' : 'is-alert') : '',
        journeyProfileInfoRow(UILANG.m('Events'), Number(eventCounts.total || 0)),
        journeyProfileInfoRow(UILANG.m('Answers'), Number(eventCounts.types?.answer || 0))
    ].filter(Boolean).join('');
    return journeyProfileInfoGroup(UILANG.m('Activity'), rows);
}

function journeyProfileInfoGroup(title, rows, actionHtml = '') {
    if (!rows) return '';
    return /* html */`
        <div class="journeyProfileInfoGroup">
            <h4>${journeyEsc(title)}</h4>
            <div>${rows}</div>
            ${actionHtml}
        </div>
    `;
}

function journeyProfileInfoRow(label, value, className = '') {
    if (value === null || typeof value === 'undefined' || value === '') return '';
    return /* html */`
        <span class="journeyProfileInfoRow ${journeyEsc(className)}">
            <b>${journeyEsc(label)}</b>
            <strong>${journeyEsc(value)}</strong>
        </span>
    `;
}

function journeyProfileNameChip(label, value) {
    if (value === null || typeof value === 'undefined' || String(value) === '') return '';
    return `<span><b>${journeyEsc(label)}</b>${journeyEsc(value)}</span>`;
}

function journeyProfileRunChip(data) {
    const runLabel = journeyRunPasswordLabel(data);
    const chipLabel = journeyIsStudentLogin(data) ? UILANG.m('Label') : UILANG.m('Password');
    if (!runLabel) return '';
    return /* html */`
        <span class="journeyProfileRunChip">
            <b>${journeyEsc(chipLabel)}</b>
            <strong>${journeyEsc(runLabel)}</strong>
        </span>
    `;
}

function journeyRunPasswordLabel(data) {
    const passwordName = String(data?.passwordName ?? '').trim();
    const passwordLabel = String(data?.passwordLabel ?? '').trim();
    const passwordTag = String(data?.passwordTag ?? '').trim();
    if (journeyIsStudentLogin(data)) return passwordLabel || passwordTag || passwordName || '';
    if (passwordName && passwordTag && passwordName !== passwordTag) return `${passwordName} / ${passwordTag}`;
    return passwordName || passwordTag || '';
}

function journeyTemplateLoginName(data) {
    return String(data?.parentTemplateName || '').trim();
}

function journeyPrimaryLoginName(data) {
    if (data?.loginTemplate === 'cloned') {
        return journeyTemplateLoginName(data) || data?.displayName || data?.loginName || UILANG.m('Test taker');
    }
    return data?.loginName || data?.displayName || UILANG.m('Test taker');
}

function journeyIsStudentLogin(data) {
    return ['directPass', 'LDAP', 'SAML'].includes(data?.loginType);
}

function journeyRunTypeInfo(data) {
    const template = data?.loginTemplate;
    if (template === 'template') {
        return {
            label: UILANG.m('Test taker template'),
            shortLabel: UILANG.m('Template'),
            icon: '../inc/filer/images/template.png',
            typeClass: 'template'
        };
    }
    if (template === 'cloned') {
        return {
            label: UILANG.m('Dataset created from template'),
            shortLabel: UILANG.m('Template dataset'),
            icon: '../inc/filer/images/template.png',
            typeClass: 'cloned'
        };
    }
    switch (data?.loginType) {
        case 'directPass':
            return {
                label: UILANG.m('Student login (Direct)'),
                shortLabel: UILANG.m('Student direct'),
                icon: '../inc/filer/images/testTaker_DP.png',
                typeClass: 'direct'
            };
        case 'LDAP':
            return {
                label: UILANG.m('Student login (LDAP)'),
                shortLabel: UILANG.m('Student LDAP'),
                icon: '../inc/filer/images/testTaker_LDAP.png',
                typeClass: 'ldap'
            };
        case 'SAML':
            return {
                label: UILANG.m('Student login (SAML)'),
                shortLabel: UILANG.m('Student SAML'),
                icon: '../inc/filer/images/testTaker_IAM.png',
                typeClass: 'saml'
            };
        default:
            return {
                label: UILANG.m('Test taker'),
                shortLabel: UILANG.m('Test taker'),
                icon: '../inc/filer/images/testee.png',
                typeClass: 'standard'
            };
    }
}

function journeyMetaTagsHtml(metaTags) {
    if (!metaTags || typeof metaTags !== 'object') return '';
    const tagRows = Object.keys(metaTags)
        .filter((key) => key !== '')
        .map((key) => {
            const value = metaTags[key];
            const isSingleTag = value === '' || value === null || typeof value === 'undefined';
            if (isSingleTag) {
                return `<span class="journeyProfileMetaRow is-single"><i class="journeySingleTagIcon" aria-hidden="true"></i><b>${journeyEsc(key)}</b></span>`;
            }
            return `<span class="journeyProfileMetaRow"><b>${journeyEsc(key)}</b><strong>${journeyEsc(journeyShortValue(value))}</strong></span>`;
        }).join('');
    if (!tagRows) return '';
    return /* html */`
        <span class="journeyProfileMetaTile" tabindex="0">
            <b>${UILANG.m('Meta tags')}</b>
            <span class="journeyProfileMetaTooltip">${tagRows}</span>
        </span>
    `;
}

function journeyYesNo(value) {
    if (typeof value === 'undefined' || value === null) return '';
    return value ? UILANG.m('yes') : UILANG.m('no');
}

function journeyFormatProfileTimestamp(value) {
    if (!value) return '';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!match) return String(value).replace(/\.\d+$/, '');
    return `${match[3]}.${match[2]}.${match[1]} ${match[4]}:${match[5]}:${match[6]}`;
}

function journeyClampPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(100, num));
}

function journeyPointsLabel(achieved, possible) {
    if (achieved === null || typeof achieved === 'undefined' || possible === null || typeof possible === 'undefined') return '';
    return `${journeyNumberLabel(achieved)} / ${journeyNumberLabel(possible)}`;
}

function journeyNumberLabel(value) {
    if (value === null || typeof value === 'undefined' || value === '') return '';
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(3)));
}

function journeyManualCompleteLabel(scoring) {
    const total = Number(scoring.manualItemsTotal || 0);
    const processed = Number(scoring.manualItemsProcessed || 0);
    if (total === 0) return UILANG.m('No manual items');
    return `${scoring.manualComplete ? UILANG.m('yes') : UILANG.m('no')} (${processed}/${total})`;
}

function journeyManualScoringNote(scoring) {
    const total = Number(scoring.manualItemsTotal || 0);
    const processed = Number(scoring.manualItemsProcessed || 0);
    if (total === 0) return '';
    if (scoring.manualComplete === true) return `${UILANG.m('Scoring complete')} (${processed}/${total})`;
    if (scoring.manualComplete === false) return `${UILANG.m('Scoring not complete')} (${processed}/${total})`;
    return '';
}

function journeyStatusClass(status) {
    status = String(status || '').toLowerCase();
    if (status.includes('submitted')) return 'journeyStatus-submitted';
    if (status.includes('active')) return 'journeyStatus-active';
    if (status.includes('offline') || status.includes('connection lost')) return 'journeyStatus-offline';
	if (status.includes('left test') || status.includes('window closed') || status.includes('forced logout')) return 'journeyStatus-aborted';
    if (status === 'closed') return 'journeyStatus-closed';
	if (status.includes('reopened')) return 'journeyStatus-open';
    if (status.includes('not started') || status.includes('not opened') || status.includes('no results')) return 'journeyStatus-notStarted';
    if (status.includes('without time') || status.includes('unlimited') || status.includes('open')) return 'journeyStatus-open';
    return 'journeyStatus-unknown';
}

function journeyTimelineHtml(timeline, pageStats = []) {
    if (!timeline.length) return '';
    const totalTime = journeyTotalPageTime(pageStats);
    const rows = timeline.map((event) => /* html */`
        <tr class="journeyEvent-${journeyEsc(event.eventType)}">
            <td>${Number(event.eventId || 0)}</td>
            <td>${journeyEsc(event.tsClient || event.tsServer || '')}</td>
            <td>${journeyEsc(event.pageName || event.itemId || '')}</td>
            <td>${journeyEsc(event.language || '')}</td>
            <td><strong>${journeyEsc(event.label || event.subType || event.eventType)}</strong><span>${journeyEsc(event.subType || '')}</span></td>
            <td>${journeyEsc(event.detail || '')}</td>
            <td>${event.secondsSincePrevious === null || typeof event.secondsSincePrevious === 'undefined' ? '' : journeyEsc(journeyFormatSeconds(event.secondsSincePrevious))}</td>
            <td>${journeyEsc(event.timeLeft || '')}</td>
        </tr>
    `).join('');

    return /* html */`
        <section id="journeyTimeline" class="journeyBand journeyTimelineBand">
            <div class="journeySectionHead">
                <h3>${UILANG.m('Complete Timeline')}</h3>
                <span>${UILANG.m('Total time')}: ${journeyEsc(totalTime.label)}</span>
            </div>
            <div class="journeyTableFrame journeyTimelineFrame">
                <table class="journeyTable journeyTimelineTable">
                    <thead><tr>
                        <th>${UILANG.m('Event')}</th>
                        <th>${UILANG.m('Event time')}</th>
                        <th>${UILANG.m('Page')}</th>
                        <th>${UILANG.m('Lang')}</th>
                        <th>${UILANG.m('Type')}</th>
                        <th>${UILANG.m('Details')}</th>
                        <th>${UILANG.m('Delta')}</th>
                        <th>${UILANG.m('Time left')}</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </section>
    `;
}

function journeyEsc(value) {
    return $('<div>').text(value ?? '').html();
}

function journeyPercent(value) {
    if (value === null || typeof value === 'undefined' || value === '') return '';
    return `${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1)} %`;
}

function journeyFormatSeconds(value) {
    if (value === null || typeof value === 'undefined' || value === '') return '';
    const seconds = Math.max(0, Math.round(Number(value)));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function journeyShortValue(value) {
    if (value === null || typeof value === 'undefined') return '';
    if (typeof value === 'object') value = JSON.stringify(value);
    value = String(value);
    return value.length > 500 ? value.substring(0, 497) + '...' : value;
}

function journeyDecodeValue(value) {
    if (value === null || typeof value === 'undefined') return value;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch (_e) {
        return value;
    }
}

async function checkUnsaved(onExit) {

    /* check if build chart is unsaved prior to closing */

    let cStr = onExit ? UILANG.m("Unsaved changes detected! If this page is left, all changes will be lost. Do you wish to exit?") : UILANG.m("Unsaved changes detected! If a new report is loaded, all changes will be lost. Do you wish to continue?");

    return new nxDialog('unsavedConf', {
        title: UILANG.m("Confirm Unsaved Changes"),
        contents: /* html */ `
            <div class="rbDialog">
                <div class="rbDialogMessage rbDialogMessage-warning">
                    <div class="rbDialogMessageIcon">!</div>
                    <div class="rbDialogMessageText">
                        <strong>${UILANG.m("Unsaved changes")}</strong>
                        <span>${cStr}</span>
                    </div>
                </div>
            </div>
        `,
        returnPromise: true,
        dataFormat: "object",
        buttons: [{
            value: true,
            label: UILANG.m("Yes")
        }, {
            value: false,
            label: UILANG.m("No"),
            'default': true
        }]
    });
}

async function closeRptBld() {

    if (unsavedState) {
        let confExit = await checkUnsaved(true);
        if (!confExit.button) return;
    }

    unsavedState = false;

    /* Reset all required elements to baseline for next report build request */
    report_config = [];
    savePlot = [];
    fromLoad = false;
    layoutData = [];
    loadLD = [];
    lastLoaded = "";

    $('#chartArea').remove();

    // re-enable up/down keys when in standard mode
    kbHandler.registerShortcut('up', cursorUp);
    kbHandler.registerShortcut('down', cursorDown);
    kbHandler.registerShortcut('BACKSPACE');
    kbHandler.registerShortcut('CR', function() {
        editSelection('shortcut');
    }, {
        preventDefault: false
    });

    $('#rb_title').remove();
    $('#rb_data').remove();
    $('#an_data').remove();
    $('#an_title').remove();
    $('#dsvl_container').remove();
    report_data = null;

    // switch back to standard test results view
    showMenu();
    hideSection(gui.s3, [gui.s3]);
    hideSection(gui.s4, [gui.s4]);
    showSection(gui.s1, [gui.s1]);
    showSection(gui.s2, [gui.s2]);
    showSection(gui.s5, [gui.s5]);

    // flip back jsbutton2 config
    testView.forEach(element => { element.show(); });
    reportView.forEach(element => { element.hide() });

    // reset pdf generate to disabled mode
    buttons.genRpt.disable();

    // re-show test view button dividers; hide report view dividers
    $('[id^="vd_test"]').show();
    $('[id^="vd_reportView"]').hide();
}

async function exportScore(expScrOpts, button) {

    let mscheck = await results_startAjax("hasMSleft", { testId: serverData['id'] });
    let hasMsLeft = mscheck.hasMSleft;
    let setExpOpts; // internal holder for options being set

    /* when scoring items are still open */
    if (typeof button === 'undefined' && hasMsLeft) {
        let contOp;
        contOp = await new nxDialog('hasmsDiag', {
            title: UILANG.m("Scoring Items Remaining Warning"),
            returnPromise: true,
            contents: /* html */ `
            <p style="font-weight: bold">${UILANG.m("WARNING!")}</p>
            <p>${UILANG.m("This test contains question items which have not yet been scored. This report should not be used for any final determinations. You may continue or cancel this operation.")}</p>
            `,
            buttons: [{
                value: 'c',
                label: UILANG.m("Cancel"),
                'default': true,
                'cancel': true
            }, {
                value: 'ok',
                label: UILANG.m("Continue"),
                'cancel': true
            }]
        });

        if (contOp.button === 'c') return;
    }
    if (!button) {
        setExpOpts = {
            // scoringModel: '',
            fmt: '',
            detail: localStorage.getItem("expDetail"),
            delim: localStorage.getItem("expDelim"),
            sd: "",
            ed: ""
        };

        const dialogData = {
            buttons: [{
                label: UILANG.m('Cancel'),
                'cancel': true,
                value: 'cancel'
            },
            {
                label: UILANG.m('Download Scoring'),
                'default': true,
                value: 'dl',
            }
            ],
            title: UILANG.m('Download Scoring Results'),
            width: 600,
            contents: /* html */ `
				<div>
					<div style='display: block; padding-bottom: 10px; border-bottom: 1px solid #ccc'>
						<strong>${UILANG.m("Export Options:")}</strong>
					</div>

					<div id="optItems" style="padding-top: 10px;"></div>

				</div>
				`,
            callback: exportScore
        };

        const scrDiag = new nxDialog('scoringDlDialog', dialogData, [setExpOpts]);

        /* Date filtering section */

        // start date input init
        insertTextfield($('#optItems'), "s_date_start", UILANG.m("Set Start Date (optional)"));
        $('#s_date_start').prop("placeholder", UILANG.m("DD-MM-YYYY starting date"));

        $('#s_date_start').datepicker({
            dateFormat: 'dd-mm-yy',
            showOn: "focus",
            maxDate: 0,
            onSelect: function(dt) {
                setExpOpts.sd = dt;
            },
            onClose: function() {
                if (isValidDate($('#s_date_start').val()) === true) {
                    $('#s_date_end').datepicker("option", "minDate", this.value);
                } else {
                    $('#s_date_end').datepicker("option", "minDate", null);
                }
            }
        });

        // handler for manual entry
        $('#s_date_start').on("input", function() {
            if (isValidDate(this.value) === true) {
                let sdParts = this.value.split("-");
                let sDate = new Date(sdParts[2], sdParts[1] - 1, sdParts[0]);

                let edParts = $("#s_date_end").val().split("-");
                let eDate = new Date(edParts[2], edParts[1] - 1, edParts[0]);

                let tDate = new Date(); // get today's date for comparison

                if (sDate > eDate || sDate > tDate) {
                    dateErrMsg(UILANG.m("Start Date must be older than End Date (when specified), and not beyond the current date."));
                    this.value = "";
                    $('#s_date_end').datepicker("option", "minDate", null);
                    scrDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                } else {
                    scrDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                }
            } else if (isValidDate(this.value) === false) {
                if (this.value !== "") {
                    $(this).css("background-color", "#d66f74");
                    $(this).css("color", "white");
                    scrDiag.disableButton("dl");
                } else { // this means date value field is blank
                    scrDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                }
            }
            setExpOpts.sd = this.value;
        });

        // end date input init
        insertTextfield($('#optItems'), "s_date_end", UILANG.m("Set End Date (optional)"));

        $('#s_date_end').datepicker({
            dateFormat: 'dd-mm-yy',
            showOn: "focus",
            maxDate: 0,
            onSelect: function(dt) {
                setExpOpts.ed = dt;
            },
            onClose: function() {
                if (isValidDate(this.value) === true) {
                    $('#s_date_start').datepicker("option", "maxDate", this.value);
                } else {
                    $('#s_date_start').datepicker("option", "maxDate", 0);
                }
            }
        });

        // handler for manual entry
        $('#s_date_end').on("input", function() {
            if (isValidDate(this.value) === true) {
                let sdParts = $("#s_date_start").val().split("-");
                let sDate = new Date(sdParts[2], sdParts[1] - 1, sdParts[0]);

                let edParts = this.value.split("-");
                let eDate = new Date(edParts[2], edParts[1] - 1, edParts[0]);

                let tDate = new Date(); // get today's date for comparison

                if (eDate < sDate || eDate > tDate) {

                    dateErrMsg(UILANG.m("End Date must be newer than Start Date, and not beyond the current date."));
                    this.value = "";
                    $('#s_date_start').datepicker("option", "maxDate", 0);
                    scrDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                } else {
                    scrDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                }
            } else if (isValidDate(this.value) === false) {
                if (this.value !== "") {
                    $(this).css("background-color", "#d66f74");
                    $(this).css("color", "white");
                    scrDiag.disableButton("dl");
                } else { // this means date value field is blank
                    scrDiag.enableButton("dl");
                    $(this).css("background-color", "initial");
                    $(this).css("color", "#000");
                }
            }

            setExpOpts.ed = this.value;
        });

        $('#s_date_end').prop("placeholder", UILANG.m("DD-MM-YYYY ending date"));

        // add hr between date and rest of the options
        $('#s_date_end').parent().parent().parent().append('<hr>');

        // make font nicer
        $('[id^="s_date_"]').css('font-size', 'smaller');

        // blur handler for date fields
        $("#s_date_start, #s_date_end").on("blur", function() {
            if (isValidDate(this.value) === false) {
                this.value = "";
                $(this).css("background-color", "initial");
                $(this).css("color", "#000");
                scrDiag.enableButton("dl");
            }
        });

        /* init file type dropdown option list */
        const dlDetails = insertDropdown($('#optItems'), 'dlDetails', UILANG.m('Level of detail'), {
            theme: 'backend',
            elements: [{
                label: UILANG.m('Score for each item'),
                value: "all"
            },
            {
                label: UILANG.m('Total score only'),
                value: "total"
            }
            ],
            onChange: detailOptChanged,
            width: "250px",
            cssCollapsed: {
                'text-align': 'left'
            },
            cssExpanded: {
                'text-align': 'left'
            },
        });

        const dlFmt = insertDropdown($('#optItems'), 'dlType', UILANG.m('Download Format'), {
            theme: 'backend',
            elements: [{
                label: UILANG.m('Comma Separated (.csv)'),
                value: "csv"
            },
            {
                label: UILANG.m('MS-Excel (.xlsx)'),
                value: "excel"
            },
            {
                label: UILANG.m('Open/Libre office (.ods)'),
                value: "openoffice"
            }
            ],
            onChange: fmtOptChanged,
            width: "250px",
            cssCollapsed: {
                'text-align': 'left'
            },
            cssExpanded: {
                'text-align': 'left'
            },
        });

        /* Delimiter value selection (for CSV only) */
        const delimSel = insertDropdown($('#optItems'), 'delim', UILANG.m('Delimiter Value (CSV)'), {
            theme: 'backend',
            elements: [{
                label: UILANG.m('Comma (,)'),
                value: ","
            },
            {
                label: UILANG.m('Semicolon (;)'),
                value: ";"
            },
            {
                label: UILANG.m('Tab (    )'),
                value: "%09"
            }
            ],
            onChange: delimOptChanged,
            width: "250px",
            cssCollapsed: {
                'text-align': 'left'
            },
            cssExpanded: {
                'text-align': 'left'
            },
        });

        dlDetails.reset(localStorage.getItem('expDetail'));
        dlFmt.reset(localStorage.getItem('expFmt'));
        fmtOptChanged(null, localStorage.getItem('expFmt'));
        delimSel.reset(localStorage.getItem('expDelim'));

        // right-align all of our option row property cells
        $('.jsInterfaceRowPropertyCell').css('text-align', 'right');
    }

    function fmtOptChanged(sender, value) {
        setExpOpts.fmt = value;

        // save/remember option
        localStorage.setItem("expFmt", value);

        // show/hide logic for delimier selection option
        (value !== "csv") ? $('.jsInterfaceRow').last().hide() : $('.jsInterfaceRow').last().show(); // this assumes that the delimiter option will always be the last row
    }

    function delimOptChanged(sender, value) {
        setExpOpts.delim = value;

        // save/remember option
        localStorage.setItem("expDelim", value);
    }

    function detailOptChanged(sender, value) {
        setExpOpts.detail = value;

        // save/remember option
        localStorage.setItem("expDetail", value);
    }

    // Send request on dl button
    if (button === 'dl') {

        await results_startAjax('fetchDetailedTestScore', {
            selectedTest: serverData['id'],
            // scoringModel: scoringModel,
            detail: expScrOpts.detail,
            format: expScrOpts.fmt,
            delimiter: expScrOpts.delim,
            startDate: expScrOpts.sd,
            endDate: expScrOpts.ed
        });
    }
}

/* date picker helper functions */

// date validity checker function
