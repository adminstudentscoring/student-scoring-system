// Monster Fight status helpers.
"use strict";

import { handleMonsterDeath } from './lifecycle';

export function addBleedStatusToPlayer(player: any, effect: any, monsterName: any) {
  if (!player || !effect) {
    return;
  }
  if (!Array.isArray(player.statuses)) {
    player.statuses = [];
  }
  player.statuses.push({
    type: 'bleed',
    remainingTurns: effect.turns || 3,
    damageFraction: effect.damageFraction || 0.01,
    source: monsterName,
    appliedThisTurn: true
  });
}

export function addBleedingClawStatusToPlayer(player: any, monster: any, effect: any) {
  if (!player || !monster || !effect) {
    return null;
  }
  if (!Array.isArray(player.statuses)) {
    player.statuses = [];
  }
  const baseAttack = typeof monster.attack === 'number' ? monster.attack : (monster.baseAttack || 0);
  const damagePerTurn = Math.max(1, Math.round(baseAttack * (effect.damageFraction || 0.2)));
  const remainingTurns = Math.max(1, effect.turns || 2);
  player.statuses.push({
    type: 'bleeding_claw',
    remainingTurns,
    damagePerTurn,
    source: monster.name,
    appliedThisTurn: true
  });
  return `${monster.name}'s Bleeding Claw wounds ${player.studentName}, dealing ${damagePerTurn} damage per turn for ${remainingTurns} turns.`;
}

export function addSilenceStatusToPlayer(player: any, duration: any, source: any) {
  if (!player || duration <= 0) {
    return;
  }
  if (!Array.isArray(player.statuses)) {
    player.statuses = [];
  }
  player.statuses.push({
    type: 'silence',
    remainingTurns: duration,
    source: source || null,
    appliedThisTurn: true
  });
}

export function isPlayerSilenced(player: any) {
  if (!player || !Array.isArray(player.statuses)) {
    return false;
  }
  return player.statuses.some((status: any) => status.type === 'silence');
}

export function applyPlayerStatusEffects(gameState: any) {
  if (!gameState || !Array.isArray(gameState.players)) {
    return [];
  }
  const logs: string[] = [];
  gameState.players.forEach((player: any) => {
    if (!player.isAlive || !Array.isArray(player.statuses) || player.statuses.length === 0) {
      return;
    }
    const remainingStatuses: any[] = [];
    player.statuses.forEach((status: any) => {
      if (status.appliedThisTurn) {
        status.appliedThisTurn = false;
        remainingStatuses.push(status);
        return;
      }
      if (status.type === 'bleed') {
        const damage = Math.max(1, Math.round((player.maxHP || 0) * (status.damageFraction || 0.01)));
        const before = player.currentHP;
        player.currentHP = Math.max(0, player.currentHP - damage);
        logs.push(`${player.studentName} suffers ${damage} bleed damage${status.source ? ` from ${status.source}` : ''}. (HP ${before} -> ${player.currentHP})`);
        if (player.currentHP <= 0) {
          player.isAlive = false;
        }
      } else if (status.type === 'bleeding_claw') {
        const damage = Math.max(1, Math.round(status.damagePerTurn || 0));
        if (damage > 0) {
          const before = player.currentHP;
          player.currentHP = Math.max(0, player.currentHP - damage);
          logs.push(`${player.studentName} suffers ${damage} Bleeding Claw damage${status.source ? ` from ${status.source}` : ''}. (HP ${before} -> ${player.currentHP})`);
          if (player.currentHP <= 0) {
            player.isAlive = false;
          }
        }
      } else if (status.type === 'silence') {
        logs.push(`${player.studentName} is silenced${status.source ? ` by ${status.source}` : ''} and cannot use skills.`);
      }
      status.remainingTurns = (status.remainingTurns || 1) - 1;
      if (player.isAlive && status.remainingTurns > 0) {
        remainingStatuses.push(status);
      }
    });
    player.statuses = remainingStatuses;
  });
  return logs;
}

export function ensureMonsterStatuses(monster: any) {
  if (!monster) {
    return [];
  }
  if (!Array.isArray(monster.statuses)) {
    monster.statuses = [];
  }
  return monster.statuses;
}

export function addStatusToMonster(monster: any, status: any) {
  if (!monster || !status) {
    return;
  }
  const statuses = ensureMonsterStatuses(monster);
  const normalized = {
    type: status.type,
    remainingTurns: typeof status.remainingTurns === 'number' ? status.remainingTurns : 1,
    skipActionsRemaining: typeof status.skipActionsRemaining === 'number' ? status.skipActionsRemaining : 1,
    source: status.source || null,
    note: status.note || null
  };
  statuses.push(normalized);
}

export function processMonsterControlStatuses(monster: any) {
  if (!monster || !Array.isArray(monster.statuses) || monster.statuses.length === 0) {
    return { skipTurn: false, logs: [] as string[] };
  }
  let skipTurn = false;
  const logs: string[] = [];
  monster.statuses.forEach((status: any) => {
    if ((status.type === 'stun' || status.type === 'freeze') && !skipTurn) {
      const remainingSkips = typeof status.skipActionsRemaining === 'number' ? status.skipActionsRemaining : 1;
      if (remainingSkips > 0) {
        skipTurn = true;
        status.skipActionsRemaining = Math.max(0, remainingSkips - 1);
        if (status.type === 'stun') {
          logs.push(`${monster.name} is stunned and cannot act this turn!`);
        } else if (status.type === 'freeze') {
          logs.push(`${monster.name} is frozen solid and skips this turn!`);
        } else {
          logs.push(`${monster.name} is incapacitated and cannot act this turn!`);
        }
      }
    }
  });
  return { skipTurn, logs };
}

export function advanceMonsterStatuses(monster: any) {
  if (!monster || !Array.isArray(monster.statuses) || monster.statuses.length === 0) {
    return;
  }
  monster.statuses = monster.statuses.filter((status: any) => {
    if (typeof status.remainingTurns === 'number') {
      status.remainingTurns -= 1;
      return status.remainingTurns > 0;
    }
    return false;
  });
}

export function applyMonsterStatusDamage(monster: any, gameState: any, data: any) {
  const result: any = { logs: [] as string[], deathLogs: [] as string[] };
  if (!monster || !monster.isAlive || !Array.isArray(monster.statuses) || monster.statuses.length === 0) {
    return result;
  }

  let monsterKilled = false;
  monster.statuses.forEach((status: any) => {
    if (!monster.isAlive) {
      return;
    }
    if (status.type === 'poison' && (status.remainingTurns === undefined || status.remainingTurns > 0)) {
      const damage = Math.max(1, status.damagePerTurn || 0);
      if (damage <= 0) {
        return;
      }
      const beforeHP = monster.currentHP;
      monster.currentHP = Math.max(0, monster.currentHP - damage);
      result.logs.push(`${monster.name} suffers ${damage} poison damage${status.source ? ` from ${status.source}` : ''}. (HP ${beforeHP} -> ${monster.currentHP})`);
      if (monster.currentHP <= 0 && monster.isAlive) {
        monster.isAlive = false;
        monsterKilled = true;
      }
    }
  });

  if (monsterKilled) {
    const deathLogs = handleMonsterDeath(monster, gameState, data);
    result.deathLogs.push(...deathLogs);
  }

  return result;
}
