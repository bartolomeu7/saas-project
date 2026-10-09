import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canChangeUserRole,
  canChangeUserStatus,
  isActivePlatformAdmin,
  isActiveSuperAdmin,
} from "../../src/lib/admin/permissions.ts";

const ROLES = ["user", "admin", "super_admin"];
const STATUSES = ["active", "inactive", "suspended"];

describe("isActivePlatformAdmin / isActiveSuperAdmin (espelham is_platform_admin / is_super_admin)", () => {
  it("só admin|super_admin COM status active é admin de plataforma", () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        const expected = (role === "admin" || role === "super_admin") && status === "active";
        assert.equal(isActivePlatformAdmin(role, status), expected, `${role}/${status}`);
      }
    }
  });

  it("só super_admin ativo é super admin", () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        assert.equal(isActiveSuperAdmin(role, status), role === "super_admin" && status === "active", `${role}/${status}`);
      }
    }
  });

  it("valores ausentes nunca concedem acesso (fail closed)", () => {
    assert.equal(isActivePlatformAdmin(null, null), false);
    assert.equal(isActivePlatformAdmin(undefined, "active"), false);
    assert.equal(isActivePlatformAdmin("super_admin", undefined), false);
    assert.equal(isActiveSuperAdmin(null, "active"), false);
  });
});

describe("canChangeUserStatus", () => {
  it("ninguém altera o próprio status", () => {
    for (const role of ROLES) assert.equal(canChangeUserStatus(role, role, true), false);
  });

  it("super_admin age sobre qualquer outro", () => {
    for (const target of ROLES) assert.equal(canChangeUserStatus("super_admin", target, false), true);
  });

  it("admin só age sobre usuário comum", () => {
    assert.equal(canChangeUserStatus("admin", "user", false), true);
    assert.equal(canChangeUserStatus("admin", "admin", false), false);
    assert.equal(canChangeUserStatus("admin", "super_admin", false), false);
  });

  it("usuário comum nunca altera status", () => {
    for (const target of ROLES) assert.equal(canChangeUserStatus("user", target, false), false);
  });
});

describe("canChangeUserRole", () => {
  it("exclusivo de super_admin e nunca em si mesmo", () => {
    assert.equal(canChangeUserRole("super_admin", false), true);
    assert.equal(canChangeUserRole("super_admin", true), false);
    assert.equal(canChangeUserRole("admin", false), false);
    assert.equal(canChangeUserRole("user", false), false);
  });
});
