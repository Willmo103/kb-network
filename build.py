import subprocess
import sys
from pathlib import Path


def run_step(cmd: list[str], description: str, cwd: Path = None):
    print(f"\n=========================================")
    print(f"Step: {description}")
    print(f"Running: {' '.join(cmd)}")
    print(f"=========================================")
    try:
        # Use shell=True on Windows to support running commands correctly in all shell contexts
        result = subprocess.run(
            cmd,
            check=True,
            shell=sys.platform == "win32",
            cwd=str(cwd) if cwd else None,
        )
    except subprocess.CalledProcessError as e:
        print(f"\n[ERROR] Step failed: {description}")
        print(f"Command returned non-zero exit code: {e.returncode}")
        sys.exit(e.returncode)
    except FileNotFoundError:
        print(
            f"\n[ERROR] Command not found. Make sure {' '.join(cmd)} is available in path."
        )
        sys.exit(1)


def clean_previous_builds():
    import shutil

    project_dir = Path(__file__).resolve().parent

    # 1. Clean project_dir / "dist"
    dist_dir = project_dir / "dist"
    if dist_dir.exists() and dist_dir.is_dir():
        print(f"Cleaning previous build directory: {dist_dir}")
        try:
            shutil.rmtree(dist_dir)
        except Exception as e:
            print(f"Warning: Failed to clean {dist_dir}: {e}")

    # 2. Clean project_dir / "desktop" / "dist"
    desktop_dist = project_dir / "desktop" / "dist"
    if desktop_dist.exists() and desktop_dist.is_dir():
        print(f"Cleaning previous desktop build directory: {desktop_dist}")
        try:
            shutil.rmtree(desktop_dist)
        except Exception as e:
            print(f"Warning: Failed to clean {desktop_dist}: {e}")


def main():
    import os
    import shutil

    clean_previous_builds()
    os.environ["USE_SYSTEM_SIGNCODE"] = "true"
    project_dir = Path(__file__).resolve().parent
    desktop_dir = project_dir / "desktop"

    # 1. Build & Package React/Electron UI
    if desktop_dir.exists() and (desktop_dir / "package.json").exists():
        run_step(
            ["npm", "install"],
            "Installing Node dependencies for Electron client",
            cwd=desktop_dir,
        )
        run_step(
            ["npm", "run", "dist"],
            "Compiling and building Electron standalone package",
            cwd=desktop_dir,
        )

        # 1b. Copy compiled Electron executable to package source
        dest_dir = project_dir / "src" / "kb_network" / "desktop_dist"
        if dest_dir.exists():
            shutil.rmtree(dest_dir)
        dest_dir.mkdir(parents=True, exist_ok=True)
        
        desktop_dist = desktop_dir / "dist"
        candidates = list(desktop_dist.glob("kb-network*.exe")) + \
                     list(desktop_dist.glob("kb-network*.AppImage")) + \
                     list(desktop_dist.glob("kb-network*.dmg"))
        if not candidates:
            candidates = [p for p in desktop_dist.iterdir() if p.is_file() and p.suffix in ('.exe', '.AppImage', '.dmg')]
            
        if candidates:
            src_exe = candidates[0]
            ext = src_exe.suffix
            dest_exe = dest_dir / f"kb-network{ext}"
            print(f"\nPackaging built Electron executable: {src_exe.name} -> {dest_exe}")
            shutil.copy2(src_exe, dest_exe)
        else:
            print("\n[WARNING] No compiled Electron executable found to package.")

    # 2. Sync python project environment
    run_step(["uv", "sync"], "Synchronizing python environment & dependencies")

    # 3. Run unit tests
    run_step(["uv", "run", "pytest"], "Running pytest suite")

    # 4. Build packaging wheel/sdist
    run_step(["uv", "build"], "Building source and wheel packages")

    # 5. Copy artifacts to ARTIFACTS_ROOT if set
    copy_artifacts()

    print("\n[SUCCESS] Build pipeline completed successfully!")


def get_project_metadata():
    import re

    project_dir = Path(__file__).resolve().parent
    pyproject_path = project_dir / "pyproject.toml"
    content = pyproject_path.read_text(encoding="utf-8")

    name_match = re.search(r'name\s*=\s*"([^"]+)"', content)
    version_match = re.search(r'version\s*=\s*"([^"]+)"', content)

    name = name_match.group(1) if name_match else "unknown"
    version = version_match.group(1) if version_match else "0.1.0"
    return name, version


def copy_artifacts():
    import shutil
    import os

    artifacts_root = os.environ.get("ARTIFACTS_ROOT")
    if not artifacts_root:
        print(
            "\n[INFO] ARTIFACTS_ROOT environment variable not set. Skipping artifact copy."
        )
        return

    app_name, version = get_project_metadata()
    target_dir = Path(artifacts_root) / app_name / version

    project_dir = Path(__file__).resolve().parent

    # Copy project_dir / "dist" to target_dir / "dist"
    dist_dir = project_dir / "dist"
    if dist_dir.exists() and dist_dir.is_dir():
        dest_dist = target_dir / "dist"
        dest_dist.mkdir(parents=True, exist_ok=True)
        print(f"Copying build artifacts from {dist_dir} to {dest_dist}...")
        for item in dist_dir.iterdir():
            if item.is_file():
                shutil.copy2(item, dest_dist / item.name)
            elif item.is_dir():
                shutil.copytree(item, dest_dist / item.name, dirs_exist_ok=True)

    # Copy project_dir / "desktop" / "dist" to target_dir / "desktop" / "dist"
    desktop_dist_dir = project_dir / "desktop" / "dist"
    if desktop_dist_dir.exists() and desktop_dist_dir.is_dir():
        dest_desktop = target_dir / "desktop" / "dist"
        dest_desktop.mkdir(parents=True, exist_ok=True)
        print(f"Copying desktop artifacts from {desktop_dist_dir} to {dest_desktop}...")
        for item in desktop_dist_dir.iterdir():
            if item.is_file():
                shutil.copy2(item, dest_desktop / item.name)
            elif item.is_dir():
                shutil.copytree(item, dest_desktop / item.name, dirs_exist_ok=True)


if __name__ == "__main__":
    main()
