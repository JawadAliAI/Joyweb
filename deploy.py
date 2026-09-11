"""
deploy.py - Joy Web / CryptoDemo Production Deploy Script
=========================================================
سرور پر latest code کو deploy اور containers کو restart کرتی ہے۔

Usage:
    python deploy.py
"""

import paramiko
import time
import sys
import io

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HOST = "76.13.197.41"
SSH_USER = "root"
SSH_PASSWORD = "J@wad2412000"
REMOTE_DIR = "/opt/cryptodemo"


def log(msg):
    print(msg, flush=True)


def connect_with_retry(max_attempts=5):
    for attempt in range(1, max_attempts + 1):
        try:
            log(f"Connecting to {HOST} (Attempt {attempt}/{max_attempts})...")
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(HOST, username=SSH_USER, password=SSH_PASSWORD, timeout=25)
            transport = client.get_transport()
            if transport:
                transport.set_keepalive(15)
            log("Connected successfully!")
            return client
        except Exception as e:
            log(f"Connection attempt {attempt} failed: {e}")
            if attempt < max_attempts:
                log("Retrying in 4 seconds...")
                time.sleep(4)
    raise RuntimeError("Could not establish SSH connection after multiple attempts.")


def exec_cmd(holder, cmd, timeout=600):
    log(f"\n$ {cmd}")
    for attempt in range(1, 4):
        try:
            transport = holder["client"].get_transport()
            if not transport or not transport.is_active():
                log("SSH connection dropped. Reconnecting...")
                try:
                    holder["client"].close()
                except Exception:
                    pass
                holder["client"] = connect_with_retry()

            _, stdout, stderr = holder["client"].exec_command(cmd, timeout=timeout)
            out = stdout.read().decode("utf-8", errors="replace")
            err = stderr.read().decode("utf-8", errors="replace")
            if out.strip():
                log(out)
            if err.strip():
                log("STDERR: " + err)
            return out + err
        except Exception as e:
            log(f"Execution error (attempt {attempt}/3): {e}")
            if attempt < 3:
                time.sleep(3)
                try:
                    holder["client"].close()
                except Exception:
                    pass
                holder["client"] = connect_with_retry()
            else:
                raise


def main():
    log("=" * 60)
    log("  JOYWEB DEPLOYMENT SCRIPT")
    log(f"  Server : {HOST}")
    log(f"  Target : {REMOTE_DIR}")
    log("=" * 60)

    holder = {"client": connect_with_retry()}

    try:
        log("\n[1/3] Updating repository on server to latest git commit...")
        exec_cmd(holder, f"cd {REMOTE_DIR} && git fetch origin && git reset --hard origin/main && git status 2>&1")

        log("\n[2/3] Building and updating Docker containers...")
        exec_cmd(holder, f"cd {REMOTE_DIR} && docker compose up -d --build 2>&1", timeout=600)

        log("\n[3/3] Checking container health...")
        time.sleep(5)
        exec_cmd(holder, "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'")

        log("\n" + "=" * 60)
        log("✅ DEPLOYED SUCCESSFULLY!")
        log(f"  Main Site : https://cptcryptoiin.com")
        log(f"  Admin     : https://admin.cptcryptoiin.com")
        log(f"  KYC Admin : https://admin.cptcryptoiin.com/admin/kyc")
        log(f"  Support   : https://cptcryptoiin.com/support")
        log(f"  Withdraw  : https://cptcryptoiin.com/assets/withdraw")
        log(f"  Deposit   : https://cptcryptoiin.com/assets/deposit")
        log("=" * 60)

    finally:
        try:
            holder["client"].close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
