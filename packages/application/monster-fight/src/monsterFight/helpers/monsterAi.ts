// Monster Fight helpers — see monsterFightHelpers.ts barrel.
"use strict";

import { calculateDamage, ensurePlayerStats, getDamageReduction, getLastAttackDamage } from './combat';
import { getPlayerPassiveEffect } from './passives';
import { addSilenceStatusToPlayer } from './status';

export function forcePlayerToAttackAlly(player: any, monster: any, gameState: any) {
  const aliveAllies = gameState.players.filter((p: any) => p.isAlive && p.studentId !== player.studentId);
  if (aliveAllies.length === 0) {
    return {
      used: false,
      log: `${monster.name} tries to compel ${player.studentName}, but there are no other allies to strike.`
    };
  }
  const victim = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
  const baseDamage = getLastAttackDamage(player, gameState);
  const beforeHP = victim.currentHP;
  const newHP = Math.max(1, victim.currentHP - baseDamage);
  const actualDamage = beforeHP - newHP;
  victim.currentHP = newHP;
  const stats = ensurePlayerStats(player);
  stats.totalDamage += actualDamage;
  const log = `${monster.name}'s dark magic forces ${player.studentName} to strike ${victim.studentName} for ${actualDamage} damage! (HP ${beforeHP} -> ${victim.currentHP})`;
  player.lastAttackDamage = actualDamage > 0 ? actualDamage : baseDamage;
  if (victim.currentHP <= 0) {
    victim.isAlive = false;
  }
  return { used: true, log };
}

export function selectPlayerTargetForMonster(alivePlayers: any, options: any = {}) {
  if (!alivePlayers || alivePlayers.length === 0) {
    return null;
  }
  const ignoreTaunt = !!options.ignoreTaunt;
  const preferNonShield = !!options.preferNonShield;

  if (!ignoreTaunt) {
    const taunter = alivePlayers.find((p: any) => p.isAlive && getPlayerPassiveEffect(p)?.tauntMonsters);
    if (taunter) return taunter;
  }

  let candidates = alivePlayers;
  if (preferNonShield) {
    const nonShield = alivePlayers.filter((p: any) => p.characterClass !== 'shield_warrior');
    if (nonShield.length > 0) {
      candidates = nonShield;
    }
  }

  return candidates.reduce((lowest: any, player: any) => (
    player.currentHP < lowest.currentHP ? player : lowest
  ), candidates[0]);
}

export function executeMonsterActiveSkill(monster: any, skill: any, gameState: any) {
  const effect = skill.effect || {};
  const skillName = skill.name || 'Skill';
  const alivePlayers = gameState.players.filter((p: any) => p.isAlive);

  if (effect.areaHeal) {
    const healFraction = Math.max(0, effect.missingHpFraction || 0);
    const aliveMonsters = gameState.monsters.filter((m: any) => m.isAlive);
    if (aliveMonsters.length === 0) {
      return { used: false };
    }
    const summaryDetails: string[] = [];
    aliveMonsters.forEach((target: any) => {
      const missing = Math.max(0, (target.maxHP || 0) - (target.currentHP || 0));
      if (missing <= 0) {
        return;
      }
      const healAmount = Math.max(1, Math.floor(missing * healFraction));
      const before = target.currentHP;
      target.currentHP = Math.min(target.maxHP, target.currentHP + healAmount);
      const actualHeal = target.currentHP - before;
      if (actualHeal > 0) {
        summaryDetails.push(`${target.name}: +${actualHeal} HP (HP ${before} -> ${target.currentHP})`);
      }
    });
    if (summaryDetails.length === 0) {
      return { used: false };
    }
    const entry = {
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: `${monster.name} casts ${skillName}, bathing allies in restorative energy.`,
      summaryDetails
    };
    return { used: true, entry };
  }

  if (effect.areaDamage) {
    if (alivePlayers.length === 0) {
      return { used: false };
    }
    const damageMultiplier = gameState.gameConfig.damageMultiplier * (effect.damageMultiplier || 1);
    const baseDamage = calculateDamage(
      monster.attack,
      1,
      damageMultiplier,
      false,
      gameState.gameConfig.critDamage
    );
    const summaryDetails: string[] = [];
    alivePlayers.forEach((player: any) => {
      const damageReduction = getDamageReduction(player);
      const finalDamage = damageReduction > 0
        ? Math.max(1, Math.round(baseDamage * (1 - damageReduction)))
        : baseDamage;
      const beforeHP = player.currentHP;
      player.currentHP = Math.max(0, player.currentHP - finalDamage);
      if (player.currentHP <= 0) {
        player.isAlive = false;
      }
      summaryDetails.push(`${player.studentName}: -${finalDamage} HP (HP ${beforeHP} -> ${player.currentHP}${damageReduction > 0 ? ', reduced' : ''})`);
    });
    const entry = {
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: `${monster.name} engulfs the party with ${skillName}!`,
      summaryDetails
    };
    return { used: true, entry };
  }

  if (effect.forcePlayerAttack) {
    if (alivePlayers.length === 0) {
      return { used: false };
    }
    const target = selectPlayerTargetForMonster(alivePlayers, { ignoreTaunt: effect.ignoreTaunt });
    if (!target) {
      return { used: false };
    }
    const result = forcePlayerToAttackAlly(target, monster, gameState);
    const entry = {
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: result.log
    };
    return { used: result.used, entry: result.used ? entry : null };
  }

  if (effect.reduceRemainingHpFraction) {
    if (alivePlayers.length === 0) {
      return { used: false };
    }
    const target = selectPlayerTargetForMonster(alivePlayers, { ignoreTaunt: effect.ignoreTaunt });
    if (!target) {
      return { used: false };
    }
    const fraction = Math.min(0.99, Math.max(0, effect.reduceRemainingHpFraction));
    const before = target.currentHP;
    const remainingFraction = 1 - fraction;
    const newHP = Math.max(1, Math.ceil(before * remainingFraction));
    const damage = before - newHP;
    target.currentHP = newHP;
    const entry = {
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: `${monster.name}'s ${skillName} rends ${target.studentName}, ripping away ${damage} HP! (HP ${before} -> ${target.currentHP})`
    };
    return { used: true, entry };
  }

  if (effect.damageMultiplier) {
    if (alivePlayers.length === 0) {
      return { used: false };
    }
    const target = selectPlayerTargetForMonster(alivePlayers, {
      ignoreTaunt: effect.ignoreTaunt,
      preferNonShield: effect.preferNonShield
    });
    if (!target) {
      return { used: false };
    }
    const damageMultiplier = gameState.gameConfig.damageMultiplier * (effect.damageMultiplier || 1);
    const damageReduction = getDamageReduction(target);
    const baseDamage = calculateDamage(
      monster.attack,
      1,
      damageMultiplier,
      false,
      gameState.gameConfig.critDamage
    );
    const finalDamage = damageReduction > 0
      ? Math.max(1, Math.round(baseDamage * (1 - damageReduction)))
      : baseDamage;
    const beforeHP = target.currentHP;
    target.currentHP = Math.max(0, target.currentHP - finalDamage);
    if (target.currentHP <= 0) {
      target.isAlive = false;
    }
    let message = `${monster.name} uses ${skillName} on ${target.studentName} for ${finalDamage} damage${damageReduction > 0 ? ' (reduced)' : ''}! (HP ${beforeHP} -> ${target.currentHP})`;

    if (effect.silenceChance && Math.random() < effect.silenceChance && target.isAlive) {
      addSilenceStatusToPlayer(target, effect.silenceDuration || 1, monster.name);
      message += ` ${target.studentName} is silenced!`;
    }

    const entry = {
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message
    };
    return { used: true, entry };
  }

  return { used: false };
}

export function attemptMonsterActiveSkill(monster: any, gameState: any) {
  if (!monster || !monster.isAlive || !Array.isArray(monster.skills)) {
    return { used: false };
  }
  const activeSkills = monster.skills.filter((skill: any) => skill.type === 'active');
  if (activeSkills.length === 0) {
    return { used: false };
  }

  monster.skillCooldowns = monster.skillCooldowns || {};

  for (const skill of activeSkills) {
    const cooldown = monster.skillCooldowns[skill.id] || 0;
    if (cooldown <= 0) {
      const result = executeMonsterActiveSkill(monster, skill, gameState);
      if (result.used) {
        monster.skillCooldowns[skill.id] = skill.cooldown || 0;
        return { used: true, entry: (result as any).entry || null };
      }
    }
  }

  return { used: false };
}
