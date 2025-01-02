"""Weekly release script for MCP servers."""

# /// script
# dependencies = [
#     "semver>=3.0.1",
#     "PyGithub>=2.1.1",
#     "rich>=13.7.0"
# ]
# ///

import json
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
    def __init__(self, name: str, current_version: str, has_breaking: bool, has_features: bool):
        self.name = name
        self.current_version = current_version
        self.has_breaking_changes = has_breaking
        self.has_new_features = has_features

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

        package_json = pkg_dir / "package.json"
        if not package_json.exists():
            continue

        with open(package_json) as f:
            pkg_data = json.load(f)

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
            name=pkg_data["name"],
            current_version=pkg_data["version"],
            has_breaking=has_breaking,
            has_features=has_features
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

def create_github_release(release_notes: str, date: str):
    """Create a GitHub release."""
    gh_token = os.environ.get("GITHUB_TOKEN")
    if not gh_token:
        raise ValueError("GITHUB_TOKEN environment variable is required")

    g = Github(gh_token)
    repo = g.get_repo(os.environ["GITHUB_REPOSITORY"])
    
    repo.create_git_release(
        tag=f"weekly-release-{date}",
        name=f"Weekly Release {date}",
        message=release_notes,
        draft=False,
        prerelease=False
    )

def main():
    """Main release process."""
    console.print("[bold blue]Starting weekly release process...[/bold blue]")
    
    changed_packages = get_changed_packages()
    if not changed_packages:
        console.print("[yellow]No packages have changed since last release[/yellow]")
        return

    # Show summary table
    table = Table(title="Packages to Release")
    table.add_column("Package")
    table.add_column("Current Version")
    table.add_column("Changes")
    
    for pkg in changed_packages:
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

    release_notes = []
    last_release_date = get_last_release_date()

    for pkg in changed_packages:
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
        release_notes.append(f"# {pkg.name}@{new_version}\n\n{changelog}")

        # Create git tag
        tag_name = f"{pkg.name}@{new_version}"
        run_command([
            "git", "tag", "-a", tag_name,
            "-m", f"Release {tag_name}\n\n{changelog}"
        ])

    # Create commit
    run_command(["git", "add", "."])
    run_command([
        "git", "commit",
        "-m", "chore: weekly release [skip ci]"
    ])

    # Push changes and tags
    run_command(["git", "push", "origin", "HEAD", "--tags"])

    # Create GitHub release
    release_body = "\n\n---\n\n".join(release_notes)
    date = datetime.now().strftime("%Y-%m-%d")
    create_github_release(release_body, date)

    # Publish to npm
    for pkg in changed_packages:
        console.print(f"[bold green]Publishing {pkg.name}...[/bold green]")
        run_command(["npm", "publish", "--workspace", pkg.name, "--access", "public"])

    console.print("[bold green]Weekly release completed successfully![/bold green]")

if __name__ == "__main__":
    main()