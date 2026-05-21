function mfRenderBattleHud() {
    const hud = mfGetHudEl();
    const stage = mfGetStageEl();
    if (!hud || !stage || !gameState) return;

    const selectedPlayerId = mfBattleUi.selectedPlayerId;
    const selectedMonsterId = mfBattleUi.selectedMonsterId;
    const player = selectedPlayerId ? (gameState.players || []).find(p => p && p.studentId === selectedPlayerId) : null;
    const playerUnit = selectedPlayerId ? (mfScene.units || []).find(u => u && u.kind === 'player' && u.id === selectedPlayerId) : null;
    const monster = selectedMonsterId ? (gameState.monsters || []).find(m => m && m.id === selectedMonsterId) : null;
    const monsterUnit = selectedMonsterId ? (mfScene.units || []).find(u => u && u.kind === 'monster' && u.id === selectedMonsterId) : null;

    const stageW = stage.clientWidth || 1;
    const stageH = stage.clientHeight || 1;

    const parts = [];

    // Player panel (actions / revive)
    if (player && playerUnit) {
        const canAct = !!(gameState.phase === 'player_turn' && player.isAlive && !player.hasActed);
        const isSilenced = mfHasStatus(player, 'silence');
        const draftPts = mfBattleUi.ptsDraft[selectedPlayerId];
        const ptsValue = Number.isFinite(Number(draftPts)) ? Number(draftPts) : (Number(player.puzzlePoints) || 0);

        const activeSkills = Array.isArray(player.skills)
            ? player.skills.filter(s => s && s.type === 'active')
            : [];
        const skillA = activeSkills[0] || null;
        const skillB = activeSkills[1] || null;

        const cd = (sid) => {
            const v = player.skillCooldowns && sid ? player.skillCooldowns[sid] : 0;
            return Number(v) || 0;
        };

        const targeting = mfBattleUi.targeting && mfBattleUi.targeting.actorId === selectedPlayerId ? mfBattleUi.targeting : null;

        // Fixed panel position (same spot for all players): inside-map, far-right (stick to edge)
        const panelH = 300;
        const margin = 10;
        // Move panel down by +200px (keep inside map)
        const top = mfClamp(margin + 200, margin, Math.max(margin, stageH - panelH - margin));

        const aCd = skillA ? cd(skillA.id) : 0;
        const bCd = skillB ? cd(skillB.id) : 0;

        const renderSkillRow = ({ kind, emoji, title, descTop, descMid, descBot, disabled, act, skillId, cdValue }) => {
        const cdChip = cdValue > 0 ? `<span class="mf-action-cd">${escapeHtml(String(cdValue))}</span>` : '';
        return `
            <div class="mf-skill-row ${disabled ? 'is-disabled' : ''}">
                <button class="mf-action-btn ${disabled ? 'is-disabled' : ''}" type="button"
                        data-mf="act" data-act="${escapeHtml(act)}" ${skillId ? `data-skill="${escapeHtml(String(skillId))}"` : ''}>
                    ${escapeHtml(String(emoji || '✨'))}${cdChip}
                </button>
                <div class="mf-skill-desc">
                    <div class="mf-skill-desc-top">${escapeHtml(String(title || kind || ''))}</div>
                    <div class="mf-skill-desc-mid">${escapeHtml(String(descMid || descTop || ''))}</div>
                    <div class="mf-skill-desc-bot">${escapeHtml(String(descBot || ''))}</div>
                </div>
            </div>
        `;
        };

        const baseCd = (s) => Math.max(0, Number(s?.cooldown) || 0);
        const actions = [];
        actions.push({
            kind: 'attack',
            emoji: '⚔️',
            title: 'Attack',
            descMid: 'Basic',
            descBot: 'Attack a monster',
            disabled: !canAct,
            act: 'attack',
            cdValue: 0
        });
        if (skillA) {
            actions.push({
                kind: skillA.id,
                emoji: skillA.emoji || '✨',
                title: skillA.name || 'Skill',
                descMid: `${skillA.type || 'active'}${baseCd(skillA) ? `  |  CD ${baseCd(skillA)}` : ''}${aCd > 0 ? `  (now ${aCd})` : ''}`,
                descBot: skillA.description || '',
                disabled: !canAct || aCd > 0 || isSilenced,
                act: 'skill',
                skillId: skillA.id,
                cdValue: aCd
            });
        }
        if (skillB) {
            actions.push({
                kind: skillB.id,
                emoji: skillB.emoji || '✨',
                title: skillB.name || 'Skill',
                descMid: `${skillB.type || 'active'}${baseCd(skillB) ? `  |  CD ${baseCd(skillB)}` : ''}${bCd > 0 ? `  (now ${bCd})` : ''}`,
                descBot: skillB.description || '',
                disabled: !canAct || bCd > 0 || isSilenced,
                act: 'skill',
                skillId: skillB.id,
                cdValue: bCd
            });
        }

        parts.push(`
        <div class="mf-action-panel mf-player-panel" data-mf-panel="player" style="right:${escapeHtml(String(margin))}px; left:auto; top:${escapeHtml(String(top))}px;">
            <div class="mf-player-panel-top">
                <div class="mf-player-panel-top-row">
                    <div class="mf-action-panel-name">${escapeHtml(String(player.studentName || ''))}</div>
                    <button class="mf-action-panel-close" type="button" data-mf="close">×</button>
                </div>
                <div class="mf-player-panel-top-main">
                    <div class="mf-player-panel-avatar">
                        ${renderIconWrap({
                            imgSrc: imageSrcForFile(classImageFileById(player.characterClass)),
                            fallbackEmoji: getPlayerClasses().find(c => c.id === player.characterClass)?.emoji || '❓',
                            alt: 'Character',
                            wrapClass: 'mf-player-panel-avatarwrap'
                        })}
                    </div>
                    <div class="mf-player-panel-hp">
                        <div class="mf-player-panel-hpbar">
                            <div class="mf-player-panel-hpfill" style="width:${escapeHtml(String(player.maxHP > 0 ? Math.max(0, Math.min(100, (player.currentHP / player.maxHP) * 100)) : 0))}%"></div>
                        </div>
                        <div class="mf-player-panel-hptext">${escapeHtml(String(player.currentHP || 0))}/${escapeHtml(String(player.maxHP || 0))} HP</div>
                        <div class="mf-player-panel-statline">
                            <span><b>ATK</b> ${escapeHtml(String(player.attack || 0))}</span>
                            ${mfRenderStatusIconsInline(player)}
                        </div>
                    </div>
                </div>
            </div>
            ${player.isAlive ? `
                ${player.hasActed ? `<div class="mf-action-taken">✓ Action Taken</div>` : ''}
                <div class="mf-player-panel-mid">
                    <div class="mf-action-pts">
                        <div class="mf-action-pts-label">Puzzle Points</div>
                        <input type="number" min="0" max="999" value="${escapeHtml(String(ptsValue))}" data-mf="pts" ${canAct ? '' : 'disabled'} />
                    </div>
                </div>
                <div class="mf-player-panel-bot">
                    <div class="mf-action-grid3">
                        <div class="mf-action-icons">
                            ${actions.map(a => `
                                <button class="mf-action-btn ${a.disabled ? 'is-disabled' : ''}" type="button"
                                        data-mf="act" data-act="${escapeHtml(a.act)}" ${a.skillId ? `data-skill="${escapeHtml(String(a.skillId))}"` : ''}
                                        ${a.disabled ? 'disabled' : ''}>
                                    ${escapeHtml(String(a.emoji || '✨'))}
                                    ${a.cdValue > 0 ? `<span class="mf-action-cd">${escapeHtml(String(a.cdValue))}</span>` : ''}
                                </button>
                            `).join('')}
                        </div>
                        <div class="mf-action-desc">
                            ${actions.map(a => `
                                <div class="mf-skill-desc ${a.disabled ? 'is-disabled' : ''}">
                                    <div class="mf-skill-desc-top">${escapeHtml(String(a.title || a.kind || ''))}</div>
                                    <div class="mf-skill-desc-mid">${escapeHtml(String(a.descMid || ''))}</div>
                                    <div class="mf-skill-desc-bot">${escapeHtml(String(a.descBot || ''))}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            ` : `
                <div class="mf-revive-wrap">
                    <div class="mf-action-stats">
                        <div class="mf-action-stat">
                            <span>HP</span>
                            <b>0/${escapeHtml(String(player.maxHP || 0))}</b>
                        </div>
                        <div class="mf-action-stat">
                            <span>ATK</span>
                            <b>${escapeHtml(String(player.attack || 0))}</b>
                        </div>
                    </div>
                    <button class="btn btn-sm btn-warning" type="button" data-mf="reviveOpen">💫 Revive</button>
                    ${(() => {
                        const draft = mfBattleUi.reviveDraft[selectedPlayerId];
                        const v = Number.isFinite(Number(draft)) ? Number(draft) : 1;
                        const max = Math.max(1, Number(player.puzzlePoints || 0));
                        return `
                            <div class="mf-revive-inline ${mfBattleUi.reviveOpenFor === selectedPlayerId ? '' : 'is-hidden'}">
                                <div class="mf-revive-label">Puzzle Points</div>
                                <input type="number" min="1" max="${escapeHtml(String(max))}" value="${escapeHtml(String(v))}" data-mf="revivePts" />
                                <button class="btn btn-primary btn-sm" type="button" data-mf="reviveAttempt">Attempt</button>
                            </div>
                        `;
                    })()}
                </div>
            `}
        </div>
        `);

        // Toggle targeting cursor
        if (targeting) stage.classList.add('mf-targeting');
        else stage.classList.remove('mf-targeting');
    }

    // Monster panel (info) - fixed inside-map, far-left, same style as player panel
    if (monster) {
        const panelH = 360;
        const margin = 10;
        const left = margin;
        // Move panel down by +200px (keep inside map)
        const top = mfClamp(margin + 200, margin, Math.max(margin, stageH - panelH - margin));

        // skills from instance fallback to type template (include passive)
        const mt = (typeof getMonsterTypes === 'function') ? (getMonsterTypes().find(t => t && t.id === monster.type) || null) : null;
        const skills = Array.isArray(monster.skills) && monster.skills.length ? monster.skills : (Array.isArray(mt?.skills) ? mt.skills : []);
        const sortedSkills = Array.isArray(skills)
            ? [...skills].filter(Boolean).sort((a, b) => {
                const ta = String(a?.type || '');
                const tb = String(b?.type || '');
                if (ta === tb) return 0;
                if (ta === 'passive') return -1;
                if (tb === 'passive') return 1;
                return 0;
            })
            : [];

        const rows = sortedSkills.map(s => {
            const base = Math.max(0, Number(s?.cooldown) || 0);
            const typ = String(s.type || '');
            return `
                <div class="mf-monster-skill">
                    <div class="mf-monster-skill-icon">${escapeHtml(String(s.emoji || (typ === 'passive' ? '🛡️' : '✨')))}</div>
                    <div class="mf-monster-skill-body">
                        <div class="mf-monster-skill-name">${escapeHtml(String(s.name || (typ === 'passive' ? 'Passive' : 'Skill')))}</div>
                        <div class="mf-monster-skill-meta">${escapeHtml(`${typ}${base ? `  |  CD ${base}` : ''}`)}</div>
                        <div class="mf-monster-skill-desc">${escapeHtml(String(s.description || ''))}</div>
                    </div>
                </div>
            `;
        }).join('');

        const hpPct = monster.maxHP > 0 ? Math.max(0, Math.min(100, (monster.currentHP / monster.maxHP) * 100)) : 0;
        parts.push(`
            <div class="mf-action-panel mf-monster-panel" data-mf-panel="monster" style="left:${Math.round(left)}px; top:${Math.round(top)}px;">
                <div class="mf-player-panel-top">
                    <div class="mf-player-panel-top-row">
                        <div class="mf-action-panel-name">${escapeHtml(String(monster.name || 'Monster'))}</div>
                        <button class="mf-action-panel-close" type="button" data-mf="closeMonster">×</button>
                    </div>
                    <div class="mf-player-panel-top-main">
                        <div class="mf-player-panel-avatar">
                            ${renderIconWrap({
                                imgSrc: imageSrcForFile(monsterImageFileByType(monster.type)),
                                fallbackEmoji: (mt && mt.emoji) ? mt.emoji : '👾',
                                alt: 'Monster',
                                wrapClass: 'mf-player-panel-avatarwrap'
                            })}
                        </div>
                        <div class="mf-player-panel-hp">
                            <div class="mf-player-panel-hpbar">
                                <div class="mf-player-panel-hpfill" style="width:${escapeHtml(String(hpPct))}%"></div>
                            </div>
                            <div class="mf-player-panel-hptext">${escapeHtml(String(monster.currentHP || 0))}/${escapeHtml(String(monster.maxHP || 0))} HP</div>
                            <div class="mf-player-panel-statline">
                                <span><b>ATK</b> ${escapeHtml(String(monster.attack || 0))}</span>
                                ${mfRenderStatusIconsInline(monster)}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="mf-player-panel-bot">
                    <div class="mf-monster-skill-list">
                        ${rows || '<div class="mf-monster-skill-empty">No skills</div>'}
                    </div>
                </div>
            </div>
        `);
    }

    hud.innerHTML = parts.join('');
    if (!parts.length) {
        hud.innerHTML = '';
        stage.classList.remove('mf-targeting');
    }
}

function mfBindBattleCanvasInput() {
    const canvas = document.getElementById('mfBattleCanvas');
    const stage = mfGetStageEl();
    const hud = mfGetHudEl();
    if (!canvas || !stage || !hud) return;
    if (canvas.dataset.mfInputBound === '1') return;
    canvas.dataset.mfInputBound = '1';

    const onCanvasClick = (ev) => {
        const r = canvas.getBoundingClientRect();
        const stageX = ev.clientX - r.left;
        const stageY = ev.clientY - r.top;

        const hit = mfHitTestUnit(stageX, stageY);
        const targeting = mfBattleUi.targeting;

        if (!targeting) {
            if (hit && hit.kind === 'player') {
                mfBattleUi.selectedPlayerId = hit.id;
                mfRenderBattleHud();
            } else {
                if (hit && hit.kind === 'monster') {
                    mfBattleUi.selectedMonsterId = hit.id;
                    mfRenderBattleHud();
                } else {
                    // Click empty: close panels
                    mfBattleUi.selectedPlayerId = null;
                    mfBattleUi.selectedMonsterId = null;
                    mfBattleUi.targeting = null;
                    mfRenderBattleHud();
                }
            }
            return;
        }

        // Targeting mode: click a valid target, else cancel targeting
        if (!hit) {
            mfBattleUi.targeting = null;
            mfRenderBattleHud();
            return;
        }

        const want = targeting.targetType;
        if (want === 'monster') {
            if (hit.kind !== 'monster' || !hit.isAlive) return;
            if (targeting.action === 'skill') {
                playerUseSkill(targeting.actorId, targeting.skillId, { type: 'monster', id: hit.id });
            } else {
                playerAttack(targeting.actorId, { type: 'monster', id: hit.id });
            }
        } else if (want === 'ally_alive') {
            if (hit.kind !== 'player' || !hit.isAlive) return;
            playerUseSkill(targeting.actorId, targeting.skillId, { type: 'ally', id: hit.id });
        } else if (want === 'ally_dead') {
            if (hit.kind !== 'player' || hit.isAlive) return;
            playerUseSkill(targeting.actorId, targeting.skillId, { type: 'ally_dead', id: hit.id });
        }

        mfBattleUi.targeting = null;
        mfRenderBattleHud();
    };

    canvas.addEventListener('click', onCanvasClick);

    canvas.addEventListener('mousemove', (ev) => {
        const r = canvas.getBoundingClientRect();
        const stageX = ev.clientX - r.left;
        const stageY = ev.clientY - r.top;
        const hit = mfHitTestUnit(stageX, stageY);
        mfBattleUi.hoveredKey = hit ? hit.key : null;
    }, { passive: true });

    // HUD interactions
    hud.addEventListener('click', (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLElement)) return;

        const btn = t.closest('[data-mf]') instanceof HTMLElement ? t.closest('[data-mf]') : null;
        if (!btn) return;

        const kind = btn.getAttribute('data-mf');
        if (kind === 'close') {
            mfBattleUi.selectedPlayerId = null;
            mfBattleUi.targeting = null;
            mfBattleUi.reviveOpenFor = null;
            mfRenderBattleHud();
            return;
        }
        if (kind === 'closeMonster') {
            mfBattleUi.selectedMonsterId = null;
            mfRenderBattleHud();
            return;
        }
        if (kind === 'reviveOpen') {
            const actorId = mfBattleUi.selectedPlayerId;
            if (!actorId) return;
            mfBattleUi.reviveOpenFor = (mfBattleUi.reviveOpenFor === actorId) ? null : actorId;
            mfRenderBattleHud();
            return;
        }
        if (kind === 'reviveAttempt') {
            const actorId = mfBattleUi.selectedPlayerId;
            if (!actorId) return;
            const pts = Math.max(1, parseInt(String(mfBattleUi.reviveDraft[actorId] ?? '1'), 10) || 1);
            void mfAttemptReviveInline(actorId, pts);
            return;
        }

        if (kind === 'act') {
            const actorId = mfBattleUi.selectedPlayerId;
            if (!actorId) return;
            const player = (gameState.players || []).find(p => p && p.studentId === actorId);
            if (!player || !player.isAlive) return;
            if (!(gameState.phase === 'player_turn') || player.hasActed) return;

            const act = btn.getAttribute('data-act');
            if (act === 'attack') {
                mfBattleUi.targeting = { actorId, action: 'attack', targetType: 'monster' };
                mfRenderBattleHud();
                return;
            }
            if (act === 'skill') {
                const skillId = btn.getAttribute('data-skill') || '';
                if (!skillId) return;
                const skill = Array.isArray(player.skills) ? player.skills.find(s => s && s.id === skillId) : null;
                if (!skill) return;

                // Cooldown check (disable already, but guard)
                const cd = player.skillCooldowns && player.skillCooldowns[skillId] ? Number(player.skillCooldowns[skillId]) : 0;
                if (cd > 0) return;

                // AOE skills: cast immediately (no targeting)
                if (mfIsAoeSkill(player, skill)) {
                    void playerUseSkill(actorId, skillId, null);
                    mfBattleUi.targeting = null;
                    mfRenderBattleHud();
                    return;
                }

                mfBattleUi.targeting = { actorId, action: 'skill', skillId, targetType: mfSkillTargetType(skill) };
                mfRenderBattleHud();
            }
        }
    });

    hud.addEventListener('input', (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLInputElement)) return;
        if (t.getAttribute('data-mf') !== 'pts') return;
        const actorId = mfBattleUi.selectedPlayerId;
        if (!actorId) return;
        mfBattleUi.ptsDraft[actorId] = Math.max(0, parseInt(t.value || '0', 10) || 0);
    });

    hud.addEventListener('input', (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLInputElement)) return;
        if (t.getAttribute('data-mf') !== 'revivePts') return;
        const actorId = mfBattleUi.selectedPlayerId;
        if (!actorId) return;
        mfBattleUi.reviveDraft[actorId] = Math.max(1, parseInt(t.value || '1', 10) || 1);
    });

    window.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            mfBattleUi.targeting = null;
            mfRenderBattleHud();
        }
    }, { passive: true });
}

