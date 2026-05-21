'use strict';

/**
 * Permissions de sanction (ban, désactivation) — règles centralisées.
 *
 * Hiérarchie Ocean Labelling :
 *   admin > moderator > curator ≥ chercheur > annotator > guest
 *
 * Règles appliquées :
 *   1. Self-action interdite (un acteur ne peut se bannir/désactiver lui-même).
 *   2. Le superuser CVAT (= admin de fait, unique) est intouchable depuis l'UI.
 *      Seule la ligne de commande peut le révoquer (createsuperuser, DB).
 *   3. Hiérarchie stricte : un acteur ne peut sanctionner que des cibles de
 *      rôle STRICTEMENT inférieur au sien. Évite :
 *      - guerre de mod (mod A bannit mod B)
 *      - peer-policing (moderator sanctionnant un curator, qui valide la
 *        science ; un dérapage scientifique remonte à l'admin)
 *      - paralysie du site si un mod compromis bannit tous les curators
 */

const ROLE_RANK = {
  admin:     5,
  moderator: 4,
  curator:   3,
  chercheur: 3,    // même niveau que curator
  annotator: 1,
  guest:     0,
};

function roleRank(role) {
  return ROLE_RANK[role] ?? 0;
}

/**
 * Lève une erreur structurée si l'action n'est pas autorisée.
 *
 * @param {object} actor   { id, role, is_superuser }
 * @param {object} target  { id, role, is_superuser, is_staff }
 * @param {string} action  description courte ('ban', 'désactiver') — pour le message d'erreur
 * @throws {Error & { status: number }}
 */
function assertCanSanction(actor, target, action = 'sanctionner') {
  // 1. Self-action
  if (Number(actor.id) === Number(target.id)) {
    throw httpError(403, `Tu ne peux pas te ${action} toi-même.`);
  }

  // 2. Superuser CVAT intouchable (admin de fait, unique, modifiable uniquement
  // via CLI/DB).
  if (target.is_superuser || target.is_staff) {
    throw httpError(403, `Impossible de ${action} un administrateur (compte protégé).`);
  }

  // 3. Hiérarchie stricte : actor doit avoir un rôle STRICTEMENT supérieur.
  const actorRank  = actor.is_superuser ? ROLE_RANK.admin : roleRank(actor.role);
  const targetRank = roleRank(target.role);
  if (actorRank <= targetRank) {
    throw httpError(403, `Ton rôle ne te permet pas de ${action} un ${target.role} (hiérarchie : seuls les rôles strictement supérieurs peuvent sanctionner).`);
  }
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { roleRank, assertCanSanction, ROLE_RANK };
