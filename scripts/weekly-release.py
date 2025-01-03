"""Weekly release script for MCP packages."""

# /// script
# dependencies = [
#     "semver>=3.0.1",
#     "PyGithub>=2.1.1",
#     "rich>=13.7.0",
#     "toml>=0.10.2"
# ]
# ///

import json
import toml
import os
from datetime import datetime, timedelta
import subprocess
from pathlib import Path
from typing import Dict, List, Optional
import semver
from github import Github
from rich.console import Console
from rich.table import Table

console = Console()

class PackageChange:
    def __init__(self, name: str, current_version: str, has_breaking: bool, has_features: bool, is_python: bool):
        self.name = name
        self.current_version = current_version
        self.has_breaking_changes = has_breaking
        self.has_new_features = has_features
        self.is_python = is_python

def get_last_release_date() -> str:
    """Get the date of last Monday."""
    today = datetime.now()
    last_monday = today - timedelta(days=today.weekday() + 7)
    return last_monday.strftime("%Y-%m-%d")

def run_command(cmd: List[str], cwd: Optional[str] = None) -> str:
    """Run a shell command and return its output."""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        console.print(f"[red]Error running command {' '.join(cmd)}:[/red]")
        console.print(e.stderr)
        raise

def get_changed_packages() -> List[PackageChange]:
    """Get list of packages that have changed since last release."""
    last_release_date = get_last_release_date()
    packages_dir = Path("src")
    changed_packages = []

    for pkg_dir in packages_dir.iterdir():
        if not pkg_dir.is_dir():
            continue

        # Check for Python package
        pyproject_toml = pkg_dir / "pyproject.toml"
        if pyproject_toml.exists():
            with open(pyproject_toml) as f:
                pkg_data = toml.load(f)
            try:
                name = pkg_data["project"]["name"]
                version = pkg_data["project"]["version"]
                is_python = True
            except KeyError:
                continue

        # Check for NPM package
        package_json = pkg_dir / "package.json"
        if package_json.exists():
            with open(package_json) as f:
                pkg_data = json.load(f)
            name = pkg_data["name"]
            version = pkg_data["version"]
            is_python = False

        if not pyproject_toml.exists() and not package_json.exists():
            continue

        # Get commits since last release
        commits = run_command([
            "git", "log",
            f"--since={last_release_date}",
            "--pretty=format:%s",
            "--",
            str(pkg_dir)
        ]).split("\n")

        if not any(commits):
            continue

        # Analyze commit messages
        has_breaking = any(
            "BREAKING CHANGE:" in commit or "!:" in commit
            for commit in commits
        )
        has_features = any(
            commit.startswith("feat:")
            for commit in commits
        )

        changed_packages.append(PackageChange(
            name=name,
            current_version=version,
            has_breaking=has_breaking,
            has_features=has_features,
            is_python=is_python
        ))

    return changed_packages

def bump_version(current: str, changes: PackageChange) -> str:
    """Determine new version based on changes."""
    ver = semver.Version.parse(current)

    if changes.has_breaking_changes:
        return str(ver.bump_major())
    if changes.has_new_features:
        return str(ver.bump_minor())
    return str(ver.bump_patch())

def generate_changelog(pkg_dir: str, since: str) -> str:
    """Generate changelog for a package."""
    commits = run_command([
        "git", "log",
        f"--since={since}",
        "--pretty=format:* %s (%h)",
        "--",
        pkg_dir
    ])

    return f"## Changes\n\n{commits}\n"

def create_github_release(release_notes: str, date: str, is_python: bool = False):
    """Create a GitHub release."""
    gh_token = os.environ.get("GITHUB_TOKEN")
    if not gh_token:
        raise ValueError("GITHUB_TOKEN environment variable is required")

    g = Github(gh_token)
    repo = g.get_repo(os.environ["GITHUB_REPOSITORY"])

    prefix = "weekly-python-release" if is_python else "weekly-release"
    repo.create_git_release(
        tag=f"{prefix}-{date}",
        name=f"Weekly {'Python ' if is_python else ''}Release {date}",
        message=release_notes,
        draft=False,
        prerelease=False
    )

def main(dry_run: bool = False):
    """Main release process."""
    console.print("[bold blue]Starting weekly package release process{} ...[/bold blue]".format(" (DRY RUN)" if dry_run else ""))

    changed_packages = get_changed_packages()
    if not changed_packages:
        console.print("[yellow]No packages have changed since last release[/yellow]")
        return

    # Group packages by type
    npm_packages = [p for p in changed_packages if not p.is_python]
    python_packages = [p for p in changed_packages if p.is_python]

    # Show summary tables
    if npm_packages:
        table = Table(title="NPM Packages to Release")
        table.add_column("Package")
        table.add_column("Current Version")
        table.add_column("Changes")

        for pkg in npm_packages:
            changes = []
            if pkg.has_breaking_changes:
                changes.append("BREAKING")
            if pkg.has_new_features:
                changes.append("FEATURES")
            if not changes:
                changes.append("PATCH")

            table.add_row(
                pkg.name,
                pkg.current_version,
                ", ".join(changes)
            )

        console.print(table)

    if python_packages:
        table = Table(title="Python Packages to Release")
        table.add_column("Package")
        table.add_column("Current Version")
        table.add_column("Changes")

        for pkg in python_packages:
            changes = []
            if pkg.has_breaking_changes:
                changes.append("BREAKING")
            if pkg.has_new_features:
                changes.append("FEATURES")
            if not changes:
                changes.append("PATCH")

            table.add_row(
                pkg.name,
                pkg.current_version,
                ", ".join(changes)
            )

        console.print(table)

    npm_release_notes = []
    python_release_notes = []
    last_release_date = get_last_release_date()

    # Process NPM packages
    for pkg in npm_packages:
        pkg_name = pkg.name.split("/")[-1]
        pkg_dir = Path("src") / pkg_name
        pkg_json = pkg_dir / "package.json"

        with open(pkg_json) as f:
            pkg_data = json.load(f)

        # Bump version
        new_version = bump_version(pkg_data["version"], pkg)
        pkg_data["version"] = new_version

        # Update package.json
        with open(pkg_json, "w") as f:
            json.dump(pkg_data, f, indent=2)

        # Generate changelog
        changelog = generate_changelog(str(pkg_dir), last_release_date)

        # Create release notes
        npm_release_notes.append(f"# {pkg.name}@{new_version}\n\n{changelog}")

        # Create git tag
        tag_name = f"{pkg.name}@{new_version}"
        run_command([
            "git", "tag", "-a", tag_name,
            "-m", f"Release {tag_name}\n\n{changelog}"
        ])

    # Process Python packages
    for pkg in python_packages:
        pkg_dir = Path("src") / pkg.name
        pyproject_toml = pkg_dir / "pyproject.toml"

        with open(pyproject_toml) as f:
            pkg_data = toml.load(f)

        # Bump version
        new_version = bump_version(pkg_data["project"]["version"], pkg)
        pkg_data["project"]["version"] = new_version

        # Update pyproject.toml
        with open(pyproject_toml, "w") as f:
            toml.dump(pkg_data, f)

        # Generate changelog
        changelog = generate_changelog(str(pkg_dir), last_release_date)

        # Create release notes
        python_release_notes.append(f"# {pkg.name}@{new_version}\n\n{changelog}")

        # Create git tag
        tag_name = f"{pkg.name}@{new_version}"
        run_command([
            "git", "tag", "-a", tag_name,
            "-m", f"Release {tag_name}\n\n{changelog}"
        ])

        # Build and publish to PyPI
        console.print(f"[bold green]Building {pkg.name}...[/bold green]")
        run_command(["python", "-m", "build"], cwd=str(pkg_dir))

        console.print(f"[bold green]Publishing {pkg.name} to PyPI...[/bold green]")
        run_command(["python", "-m", "twine", "upload", "dist/*"], cwd=str(pkg_dir))

    if changed_packages:
        if not dry_run:
            # Create commit
            run_command(["git", "add", "."])
            run_command([
                "git", "commit",
                "-m", "chore: weekly package release [skip ci]"
            ])

            # Push changes and tags
            run_command(["git", "push", "origin", "HEAD", "--tags"])

            # Create GitHub releases
            date = datetime.now().strftime("%Y-%m-%d")

            if npm_release_notes:
                npm_release_body = "\n\n---\n\n".join(npm_release_notes)
                create_github_release(npm_release_body, date)

            if python_release_notes:
                python_release_body = "\n\n---\n\n".join(python_release_notes)
                create_github_release(python_release_body, date, is_python=True)

            # Publish NPM packages
            for pkg in npm_packages:
                console.print(f"[bold green]Publishing {pkg.name} to npm...[/bold green]")
                run_command(["npm", "publish", "--workspace", pkg.name, "--access", "public"])
        else:
            console.print("\n[yellow]DRY RUN - No changes were made[/yellow]")

    console.print("[bold green]Weekly package release completed successfully![/bold green]")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Run in dry-run mode (no changes will be made)")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
