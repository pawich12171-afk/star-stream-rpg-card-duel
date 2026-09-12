import fs from 'node:fs';
import path from 'node:path';

function patchFile(file, replacer) {
  const full = path.resolve(file);
  let source = fs.readFileSync(full, 'utf8');
  const next = replacer(source);
  if (next === source) return false;
  fs.writeFileSync(full, next, 'utf8');
  return true;
}

// StatusWindow: make every save/upgrade use the latest character state.
patchFile('src/components/StatusWindow.tsx', (source) => {
  source = source.replace(
    "import React, { useState } from 'react';",
    "import React, { useEffect, useRef, useState } from 'react';"
  );

  if (!source.includes('const latestCharacterRef = useRef<CharacterProfile>(character);')) {
    const anchor = "  const [newCharacteristic, setNewCharacteristic] = useState('');\n";
    if (source.includes(anchor)) {
      const helper = `
  const latestCharacterRef = useRef<CharacterProfile>(character);

  useEffect(() => {
    latestCharacterRef.current = character;
  }, [character]);

  const commitCharacterUpdate = (updated: CharacterProfile) => {
    const committed = { ...updated, lastUpdated: Date.now() };
    latestCharacterRef.current = committed;
    onUpdateCharacter(committed);
  };
`;
      source = source.replace(anchor, anchor + helper);
    }
  }

  // Replace only the save handler. The important part is NOT calling
  // syncCharacterHealth here: the values typed by the admin are authoritative.
  const start = source.indexOf('  const handleSaveStats = ');
  if (start >= 0) {
    const end = source.indexOf('\n  return (', start);
    if (end > start) {
      const replacement = `  const handleSaveStats = () => {
    const latest = latestCharacterRef.current;
    const updated: CharacterProfile = {
      ...latest,
      stats: { ...tempStats },
      hp: Number(tempHp),
      maxHp: Number(tempMaxHp),
      statusBuffs: tempBuffs,
      characteristics: [...tempCharacteristics],
      lastUpdated: Date.now(),
    };

    // Direct Status edits are already the effective values shown to the user.
    // Do not run syncCharacterHealth here, because that function intentionally
    // reconstructs values from the old admin snapshot + modifiers.
    commitCharacterUpdate(updated);
    setShowStatEditModal(false);
  };
`;
      source = source.slice(0, start) + replacement + source.slice(end);
    }
  }

  // Rapid +/- edits must use the latest React state.
  source = source.replace(
    /setTempStats\(\{\s*\.\.\.tempStats,\s*(strength|durability|agility|magic):\s*tempStats\.\1\s*([+-])\s*(\d+)\s*\}\)/g,
    (_m, stat, op, amount) => `setTempStats(prev => ({ ...prev, ${stat}: prev.${stat} ${op} ${amount} }))`
  );

  return source;
});

// healthSystem: when an admin edits an effective Status value, preserve that
// exact value instead of rebuilding it from an older adminBalanceSnapshot.
patchFile('src/utils/healthSystem.ts', (source) => {
  const marker = '  const snapshot = working.adminBalanceSnapshot;\n';
  if (!source.includes(marker)) return source;

  const oldBlock = `  const snapshot = working.adminBalanceSnapshot;
  let baseMaxHp = Number(snapshot.maxHp) || 1;

  if ((working.id === 'hayeon' || working.id === 'baek-hayeon') && baseMaxHp === 169 && maxHpDelta === -10) {
    baseMaxHp = 168;
  }

  const targetMaxHp = Math.max(1, baseMaxHp + maxHpDelta);
  const targetHp = Math.max(0, Math.min(targetMaxHp, Number(snapshot.hp || 0) + hpDelta));

  const effectiveStats = { ...snapshot.stats };
  (['strength', 'durability', 'agility', 'magic'] as const).forEach((key) => {
    const delta = modifiers
      .filter(m => m.kind === 'stat' && m.stat === key)
      .reduce((sum, m) => sum + signedAdminModifier(m), 0);
    effectiveStats[key] = Math.max(0, Number(snapshot.stats[key] || 0) + delta);
  });

  const effectiveSkills = (snapshot.skills || []).map((baseSkill) => {
    const delta = modifiers
      .filter(m => m.kind === 'skill' && m.skillId === baseSkill.id)
      .reduce((sum, m) => sum + signedAdminModifier(m), 0);
    const maxLevel = Math.max(Number(baseSkill.maxLevel || 10), 1);
    return {
      ...baseSkill,
      level: Math.max(1, Math.min(maxLevel, Number(baseSkill.level || 1) + delta)),
    };
  });

  persistAdminOverlay({
    ...working,
    stats: effectiveStats,
    skills: effectiveSkills,
    adminBalanceSnapshot: { ...snapshot, maxHp: baseMaxHp },
  });

  return {
    ...working,
    hp: targetHp,
    maxHp: targetMaxHp,
    stats: effectiveStats,
    skills: effectiveSkills,
  };
`;

  const newBlock = `  const snapshot = working.adminBalanceSnapshot;
  let baseMaxHp = Number(snapshot.maxHp) || 1;

  if ((working.id === 'hayeon' || working.id === 'baek-hayeon') && baseMaxHp === 169 && maxHpDelta === -10) {
    baseMaxHp = 168;
  }

  // IMPORTANT: if the caller already supplied an edited effective value,
  // synchronize the snapshot's base value to that effective value minus the
  // active modifier. This prevents 104 from being reconstructed as 102.
  const editedStats = { ...working.stats };
  const reconciledStats = { ...snapshot.stats };
  (['strength', 'durability', 'agility', 'magic'] as const).forEach((key) => {
    const delta = modifiers
      .filter(m => m.kind === 'stat' && m.stat === key)
      .reduce((sum, m) => sum + signedAdminModifier(m), 0);
    const incoming = Number(editedStats[key]);
    if (Number.isFinite(incoming)) {
      reconciledStats[key] = Math.max(0, incoming - delta);
    }
  });

  const incomingMaxHp = Number(working.maxHp);
  const incomingHp = Number(working.hp);
  if (Number.isFinite(incomingMaxHp)) baseMaxHp = Math.max(1, incomingMaxHp - maxHpDelta);

  const targetMaxHp = Math.max(1, baseMaxHp + maxHpDelta);
  const targetHp = Number.isFinite(incomingHp)
    ? Math.max(0, Math.min(targetMaxHp, incomingHp))
    : Math.max(0, Math.min(targetMaxHp, Number(snapshot.hp || 0) + hpDelta));

  const effectiveStats = { ...reconciledStats };
  (['strength', 'durability', 'agility', 'magic'] as const).forEach((key) => {
    const delta = modifiers
      .filter(m => m.kind === 'stat' && m.stat === key)
      .reduce((sum, m) => sum + signedAdminModifier(m), 0);
    effectiveStats[key] = Math.max(0, Number(reconciledStats[key] || 0) + delta);
  });

  const effectiveSkills = (snapshot.skills || []).map((baseSkill) => {
    const delta = modifiers
      .filter(m => m.kind === 'skill' && m.skillId === baseSkill.id)
      .reduce((sum, m) => sum + signedAdminModifier(m), 0);
    const maxLevel = Math.max(Number(baseSkill.maxLevel || 10), 1);
    return {
      ...baseSkill,
      level: Math.max(1, Math.min(maxLevel, Number(baseSkill.level || 1) + delta)),
    };
  });

  persistAdminOverlay({
    ...working,
    stats: effectiveStats,
    skills: effectiveSkills,
    adminBalanceSnapshot: {
      ...snapshot,
      stats: reconciledStats,
      hp: Number.isFinite(incomingHp) ? Math.max(0, incomingHp - hpDelta) : snapshot.hp,
      maxHp: baseMaxHp,
      capturedAt: Date.now(),
    },
  });

  return {
    ...working,
    hp: targetHp,
    maxHp: targetMaxHp,
    stats: effectiveStats,
    skills: effectiveSkills,
  };
`;

  if (!source.includes(oldBlock)) throw new Error('healthSystem sync block not found; refusing unsafe build patch');
  return source.replace(oldBlock, newBlock);
});

console.log('Status exact-value persistence patch applied.');
