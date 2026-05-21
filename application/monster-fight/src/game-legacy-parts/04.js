function drawHpBar(ctx, x, y, w, h, pct, text) {
    const p = Math.max(0, Math.min(1, pct));
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = 'rgba(90, 200, 90, 0.95)';
    ctx.fillRect(x - w / 2, y - h / 2, w * p, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);

    if (text) {
        ctx.font = '900 9px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        const s = String(text);
        ctx.strokeText(s, x, y + 0.5);
        ctx.fillText(s, x, y + 0.5);
    }
    ctx.restore();
}

function drawUnit(ctx, unit, now) {
    const {
        key,
        x, y,
        imgSrc,
        name,
        currentHP,
        maxHP,
        isAlive = true,
        isMonster = false
    } = unit;

    const off = mfAnimOffsetForKey(key, now);
    const ux = x + off.dx;
    const uy = y + off.dy;

    // sprite scale
    const w = Math.round(76 * MF_UNIT_SCALE);
    const h = Math.round(76 * MF_UNIT_SCALE);
    const img = getImgSync(imgSrc);

    // Track alive/dead transition for flash effect
    if (key) {
        const prevAlive = mfLastAliveByKey.get(key);
        if (prevAlive === true && !isAlive) {
            mfDeathFxByKey.set(key, { t0: now });
        }
        mfLastAliveByKey.set(key, !!isAlive);
        if (isAlive) {
            mfDeathFxByKey.delete(key);
        }
    }

    ctx.save();

    if (!isAlive) {
        const fx = key ? mfDeathFxByKey.get(key) : null;
        const age = fx ? (now - fx.t0) : 999999;
        const flashMs = 520; // total flash window
        if (fx && age < flashMs) {
            // Flash a few times: alternate visibility
            const t = Math.floor(age / 80);
            ctx.globalAlpha = (t % 2 === 0) ? 1.0 : 0.15;
        } else {
            // Settled dead look
            ctx.globalAlpha = 0.35;
            // Canvas filter is supported in modern browsers; fallback is just alpha.
            try { ctx.filter = 'grayscale(1)'; } catch {}
        }
    }

    // heal glow (behind sprite)
    const hg = mfAnim.healGlows.get(String(key || ''));
    if (hg) {
        const t = (now - hg.t0) / hg.dur;
        if (t >= 0 && t <= 1) {
            const a = (1 - t) * 0.55;
            ctx.save();
            ctx.globalAlpha *= a;
            ctx.fillStyle = 'rgba(34,197,94,0.35)';
            try {
                ctx.shadowColor = 'rgba(34,197,94,0.8)';
                ctx.shadowBlur = Math.max(6, Math.round(18 * MF_UNIT_SCALE));
            } catch {}
            const r = Math.max(18, Math.round((w * 0.55)));
            ctx.beginPath();
            ctx.arc(ux, uy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // sprite
    if (img) {
        // hit flash alpha (stacked on top of death alpha)
        ctx.globalAlpha *= mfAnimFlashAlpha(key, now);
        const flipped = mfAnimIsFlipped(key, now);
        if (flipped) {
            ctx.save();
            ctx.translate(ux, uy);
            ctx.scale(-1, 1);
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            ctx.restore();
        } else {
            ctx.drawImage(img, ux - w / 2, uy - h / 2, w, h);
        }
    } else {
        ctx.fillStyle = isMonster ? 'rgba(255,80,80,0.55)' : 'rgba(80,160,255,0.55)';
        ctx.beginPath();
        ctx.arc(ux, uy, 28, 0, Math.PI * 2);
        ctx.fill();
    }

    // hp (support delayed HP reveal for melee impacts)
    const hold = key ? mfAnim.hpHold.get(String(key)) : null;
    const hpCur = (hold && now < hold.until) ? hold.cur : currentHP;
    const pct = (maxHP > 0) ? (Number(hpCur || 0) / Number(maxHP || 1)) : 0;
    // bring HP closer to sprite
    const hpW = Math.round(72 * MF_UNIT_SCALE);
    const hpH = 9;
    const hpX = ux;
    const hpY = uy + h / 2 + 6;
    const hpText = `${escapeHtml(String(hpCur || 0))}/${escapeHtml(String(maxHP || 0))}`;
    drawHpBar(ctx, hpX, hpY, hpW, hpH, pct, hpText);

    // action taken tick (players only)
    const acted = !!(!isMonster && (unit?.raw?.hasActed));
    if (acted) {
        ctx.save();
        ctx.font = '900 12px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.fillStyle = 'rgba(34, 197, 94, 0.95)';
        ctx.strokeText('✓', hpX - hpW / 2 - 10, hpY);
        ctx.fillText('✓', hpX - hpW / 2 - 10, hpY);
        ctx.restore();
    }

    // statuses to the right of HP bar
    const statuses = mfExtractStatusesWithPassives(unit.raw || unit);
    drawStatusIcons(ctx, hpX + hpW / 2 + 6, hpY, statuses);

    ctx.restore();
}

function drawBattleEntities(ctx, stageW, stageH) {
    if (!gameState) return;
    const playersAll = Array.isArray(gameState.players) ? gameState.players.filter(p => p) : [];
    const monstersAll = Array.isArray(gameState.monsters) ? gameState.monsters.filter(m => m) : [];

    // Arena region: avoid top/bottom edges
    const top = 90;
    const bottom = Math.max(top + 200, stageH - 90);
    const arenaH = Math.max(240, bottom - top);

    // Bring both sides closer together
    const monstersBaseX = stageW * 0.38;
    const playersBaseX = stageW * 0.62;

    const monsters = layoutSide(
        monstersAll.map(m => ({
            key: `monster:${m.id}`,
            isMonster: true,
            isAlive: m.isAlive,
            id: m.id,
            name: m.name,
            currentHP: m.currentHP,
            maxHP: m.maxHP,
            raw: m,
            imgSrc: imageSrcForFile(monsterImageFileByType(m.type))
        })),
        monstersBaseX,
        -1,
        top,
        arenaH
    );

    const players = layoutSide(
        playersAll.map(p => ({
            key: `player:${p.studentId}`,
            isMonster: false,
            isAlive: p.isAlive,
            id: p.studentId,
            name: p.studentName,
            currentHP: p.currentHP,
            maxHP: p.maxHP,
            raw: p,
            imgSrc: imageSrcForFile(classImageFileById(p.characterClass))
        })),
        playersBaseX,
        +1,
        top,
        arenaH,
        { colGap: 100 } // +10px between left/right player columns
    );

    // Save unit bounds for hit-testing/HUD anchoring (DOM coordinates)
    const spriteW = Math.round(76 * MF_UNIT_SCALE);
    const spriteH = Math.round(76 * MF_UNIT_SCALE);
    mfScene.stageW = stageW;
    mfScene.stageH = stageH;
    mfScene.units = [
        ...monsters.map(u => ({ ...u, kind: 'monster', w: spriteW, h: spriteH })),
        ...players.map(u => ({ ...u, kind: 'player', w: spriteW, h: spriteH }))
    ];

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // Draw monsters then players (players on top)
    monsters.forEach(u => drawUnit(ctx, u, now));
    players.forEach(u => drawUnit(ctx, u, now));

    // Hover name label (semi-transparent, centered on sprite)
    const hoveredKey = mfBattleUi?.hoveredKey;
    if (hoveredKey) {
        const u = (mfScene.units || []).find(it => it && it.key === hoveredKey);
        if (u && u.name) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '900 14px Segoe UI, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.78)';
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 4;
            ctx.strokeText(String(u.name), u.x, u.y);
            ctx.fillText(String(u.name), u.x, u.y);
            ctx.restore();
        }
    }
}

function mfGetStageEl() {
    return document.querySelector('.mf-battle-stage');
}

function mfGetHudEl() {
    return document.getElementById('mfBattleHud');
}

function mfClamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
}

function mfHitTestUnit(stageX, stageY) {
    // Prefer topmost (players drawn last), so iterate backwards.
    const units = Array.isArray(mfScene.units) ? mfScene.units : [];
    for (let i = units.length - 1; i >= 0; i--) {
        const u = units[i];
        const w = Number(u.w) || 0;
        const h = Number(u.h) || 0;
        if (!w || !h) continue;
        if (stageX >= u.x - w / 2 && stageX <= u.x + w / 2 && stageY >= u.y - h / 2 && stageY <= u.y + h / 2) {
            return u;
        }
    }
    return null;
}

function mfSkillTargetType(skill) {
    const e = skill && typeof skill === 'object' ? (skill.effect || {}) : {};
    if (e && e.revive) return 'ally_dead';
    if (e && (e.heal || e.teamHeal || e.healPercent)) return 'ally_alive';
    return 'monster';
}

function mfIsAoeSkill(player, skill) {
    if (!skill || typeof skill !== 'object') return false;
    const e = (skill.effect && typeof skill.effect === 'object') ? skill.effect : {};
    // Prefer explicit effect flags if present
    if (e.aoe || e.allEnemies || e.area || e.teamDamage || e.damageAll || e.hitAll || e.areaDamage) return true;
    // Fallback: detect from name/description for Wizard Fireball
    const cls = String(player?.characterClass || '').toLowerCase();
    const nm = String(skill.name || skill.id || '').toLowerCase();
    const desc = String(skill.description || '').toLowerCase();
    if (cls === 'wizard' && (nm.includes('fireball') || desc.includes('fireball'))) return true;
    if (desc.includes('all enemies') || desc.includes('all enemy') || desc.includes('area damage')) return true;
    return false;
}

function mfStatusIcon(status) {
    const t = String(status?.type || '').trim().toLowerCase();
    if (!t) return null;
    if (t === 'taunt') return { key: 'taunt', ch: '🛡️' };
    if (t === 'poison') return { key: 'poison', ch: '☠️' };
    if (t === 'bleed' || t === 'bleeding_claw') return { key: 'bleed', ch: '🩸' };
    if (t === 'silence') return { key: 'silence', ch: '🤫' };
    if (t === 'stun') return { key: 'stun', ch: '💫' };
    if (t === 'freeze') return { key: 'freeze', ch: '❄️' };
    if (t === 'burn') return { key: 'burn', ch: '🔥' };
    if (t === 'regen') return { key: 'regen', ch: '💚' };
    if (t === 'attack') return { key: 'atkdown', ch: '⬇️' };
    return { key: t, ch: t.slice(0, 1).toUpperCase() };
}

function mfExtractStatuses(entity) {
    const arr = Array.isArray(entity?.statuses) ? entity.statuses : [];
    // Deduplicate by type
    const seen = new Set();
    const out = [];
    for (const s of arr) {
        const t = String(s?.type || '').trim().toLowerCase();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        out.push(s);
        if (out.length >= 6) break;
    }
    return out;
}

function mfHasStatus(entity, type) {
    const want = String(type || '').trim().toLowerCase();
    if (!want) return false;
    const arr = Array.isArray(entity?.statuses) ? entity.statuses : [];
    return arr.some(s => String(s?.type || '').trim().toLowerCase() === want);
}

function mfHasPassiveFlag(entity, flag) {
    const want = String(flag || '').trim();
    if (!want) return false;
    const skills = Array.isArray(entity?.skills) ? entity.skills : [];
    return skills.some(s => s && s.type === 'passive' && s.effect && typeof s.effect === 'object' && !!s.effect[want]);
}

function mfExtractStatusesWithPassives(entity) {
    const out = mfExtractStatuses(entity);
    // Show always-on taunt passive as a visible icon
    if (mfHasPassiveFlag(entity, 'tauntMonsters') || mfHasPassiveFlag(entity, 'tauntPlayers')) {
        out.unshift({ type: 'taunt' });
    }
    return out.slice(0, 6);
}

function drawStatusIcons(ctx, xRight, yCenter, statuses) {
    const list = Array.isArray(statuses) ? statuses : [];
    if (!list.length) return;
    const size = 14;
    const gap = 4;
    let x = xRight;
    for (let i = 0; i < list.length; i++) {
        const icon = mfStatusIcon(list[i]);
        if (!icon) continue;
        ctx.save();
        ctx.font = '900 12px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // subtle background chip
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        const r = 6;
        const left = x + i * (size + gap);
        const top = yCenter - size / 2;
        // rounded rect
        ctx.moveTo(left + r, top);
        ctx.arcTo(left + size, top, left + size, top + size, r);
        ctx.arcTo(left + size, top + size, left, top + size, r);
        ctx.arcTo(left, top + size, left, top, r);
        ctx.arcTo(left, top, left + size, top, r);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(String(icon.ch || ''), left + size / 2, yCenter + 0.5);
        ctx.restore();
    }
}

function mfRenderStatusIconsInline(entity) {
    const statuses = mfExtractStatuses(entity);
    if (!statuses.length) return '';
    return `
        <div class="mf-inline-statuses" aria-label="Statuses">
            ${statuses.map(s => {
                const ico = mfStatusIcon(s);
                if (!ico) return '';
                return `<span class="mf-inline-status" title="${escapeHtml(statusLabel(s) || String(s?.type || ''))}">${escapeHtml(String(ico.ch || ''))}</span>`;
            }).join('')}
        </div>
    `;
}

