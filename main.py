from get_project_root import get_project_root
from datetime import datetime, timezone, timedelta
from InquirerPy import inquirer
import json
from packaging.version import parse
import pathlib
import re
from rich.console import Console
import shutil
import subprocess
import typer

console = Console()
app = typer.Typer()

PROJECT_ROOT = get_project_root()
TEMP_FILES = ["package-backup.json", "package-versions.json", "package-peerDependencies.json", ".npm_cache.json"]

# TODO: handle stale dependencies
STALE_DEPENDENCIES_FILE = "<placeholder>.json"

# region -
# region INIT





# region -
# region . find_packages
def find_packages():
    skip_directories = {
        "node_modules", "__pycache__", ".git", ".idea", ".vscode",
        "dist", "build", "venv", ".venv",
    }
    results: list[pathlib.PosixPath] = []
    for directory_path, directories, files in PROJECT_ROOT.walk(top_down=True, follow_symlinks=False):
        directories[:] = [directory for directory in directories if directory not in skip_directories]
        if "package.json" in files: results.append(directory_path / "package.json")
    return results

# region . select_package
def select_package():
    package_paths = find_packages()
    if len(package_paths) == 0:
        console.print("[red]No package.json files found in the project.[/red]")
        raise typer.Exit()
    selected_package = inquirer.select(
        message="\nSelect a package.json to update:",
        choices=[str(package_path.relative_to(PROJECT_ROOT)) for package_path in package_paths] + ["EXIT"],
    ).execute()
    if selected_package == "EXIT":
        console.print("[orange]exiting[/orange]")
        raise typer.Exit()
    return (PROJECT_ROOT / pathlib.Path(selected_package)).parent

# region . backup_package
def backup_package(package_directory: pathlib.PosixPath):
    package_path = package_directory / "package.json"
    package_backup_path = package_directory / "package-backup.json"
    shutil.copy2(package_path, package_backup_path)
    console.print(f"created backup package: {package_backup_path}")





# region -
# region FILE I/O





# region -
# region . get_dependencies_list
def get_dependencies_list(package_directory: pathlib.PosixPath):
    with open(package_directory / "package.json", "r") as file:
        package = json.load(file)
        dependencies_list = []
        for key, value in package.items():
            if "dependencies" in key.lower():
                dependencies_list.extend(list(value))
        return dependencies_list

# region . get_latest_version_restrictions
def get_latest_version_restrictions(package_directory: pathlib.PosixPath):
    with open(package_directory / "package.json", "r") as file:
        package = json.load(file)
        return package.get("latestVersionRestrictions", {})

# region . write_package_versions
def write_package_versions(package_directory: pathlib.PosixPath, package):
    with open(package_directory / "package-versions.json", "w") as file:
        package_versions = {}
        for dependency, dependency_info in package.items():
            package_versions[dependency] = dependency_info["version"]
        json.dump(package_versions, file, indent=4)

# region . write_package_peerDependencies
def write_package_peerDependencies(package_directory: pathlib.PosixPath, package):
    with open(package_directory / "package-peerDependencies.json", "w") as file:
        package_peerDependencies = {}
        for dependency, dependency_info in package.items():
            package_peerDependencies[dependency] = {}
            for key, value in dependency_info.items():
                if key != "versions":
                    package_peerDependencies[dependency][key] = value
        json.dump(package_peerDependencies, file, indent=4)

# region . print_added_peerDependencies
def print_added_peerDependencies(package_directory: pathlib.PosixPath, package):
    added_peerDependencies = []
    dependencies = get_dependencies_list(package_directory)
    for dependency in package:
        if dependency in dependencies: continue
        added_peerDependencies.append(dependency)
    console.print(f"\nadded peerDependencies: {added_peerDependencies}")

# region . print_stale_dependencies
def print_stale_dependencies(package):
    stale_dependencies = []
    for dependency, dependency_info in package.items():
        if dependency_info["stale"]:
            stale_dependencies.append(dependency)
    console.print(f"\nstale dependencies found: {stale_dependencies}")

# region . overwrite_package
def overwrite_package(package_directory: pathlib.PosixPath):
    overwrite = inquirer.confirm(
        message="Do you want to overwrite and update versions to {package_path}?",
        default=False,
    ).execute()
    if overwrite:
        package_path = pathlib.Path(package_directory / "package.json")
        with open(package_directory / "package-versions.json", "r") as file:
            package_versions = json.load(file)
        with open(package_path, "r") as file:
            package_json = json.load(file)
        updated_dependencies = []
        for key in package_json:
            if "dependencies" not in key.lower(): continue
            for dependency, version in package_versions.items():
                if dependency in package_json[key]:
                    package_json[key][dependency] = version
                    updated_dependencies.append(dependency)
        for dependency, version in package_versions.items():
            if dependency in updated_dependencies: continue
            package_json["dependencies"][dependency] = version
        with open(package_path, "w") as file:
            json.dump(package_json, file, indent=4)
        console.print(f"[bold green]{package_path} has been updated with versions from package-versions.json.[/bold green]")
        cleanup_temp_files(package_directory)
    else:
        console.print(f"Package update was not performed for {package_path}.")

# region . cleanup_temp_files
def cleanup_temp_files(package_directory: pathlib.PosixPath):
    remove_files = inquirer.confirm(
        message="Remove temporary files?",
        default=False,
    ).execute()
    if remove_files:
        for TEMP_FILE in TEMP_FILES:
            TEMP_FILE_PATH = package_directory / TEMP_FILE
            if TEMP_FILE_PATH.exists():
                TEMP_FILE_PATH.unlink()
                console.print(f"[green]Removed {TEMP_FILE}[/green]")





# region -
# region NPM HELPERS





# region -
# region . json_npm_shell
def json_npm_shell(command, dependency, field, default="{}"):
    output = subprocess.run(f"npm {command} {dependency} {field} --json", shell=True, capture_output=True, text=True).stdout.strip()
    return json.loads(output or default)

# region . npm_cache
def npm_cache(package_directory: pathlib.PosixPath, command, dependency, field, default="{}"):
    NPM_CACHE_FILE = ".npm_cache.json"
    full_command = f"{command} {dependency} {field}"
    cache, data = {}, None
    if (package_directory / NPM_CACHE_FILE).exists():
        with open(package_directory / NPM_CACHE_FILE, "r") as file:
            cache = json.load(file)
        if full_command in cache: return cache[full_command]
    data = json_npm_shell(command, dependency, field, default=default)
    cache[full_command] = data
    with open(package_directory / NPM_CACHE_FILE, "w") as file:
        json.dump(cache, file, indent=4)
    return data

# region . get_versions
def get_versions(package_directory: pathlib.PosixPath, dependency):
    console.print(f"{dependency}: versions", end=" ")
    versions_output = npm_cache(package_directory, "info", dependency, "versions", "[]")
    pattern = r"\d+\.\d+\.\d+(?:-0)?"
    filtered_versions = list(set([version for version in versions_output if re.fullmatch(pattern, version)]))
    versions = sorted(filtered_versions, key=parse, reverse=True)
    console.print(f"({len(versions)})", end=" ")
    return versions

# region . get_latest_version
def get_latest_version(package_directory: pathlib.PosixPath, dependency):
    console.print(f"latest version", end=" ")
    dist_tags_output = npm_cache(package_directory, "view", dependency, "dist-tags")
    latest_version = dist_tags_output["latest"]
    console.print(f"({latest_version})", end=" ")
    return latest_version

# region . get_peerDependencies
def get_peerDependencies(package_directory: pathlib.PosixPath, dependency, version, mute=False):
    if mute == False: console.print(f"peerDependencies", end=" ")
    peerDependencies_output = npm_cache(package_directory, "info", f"{dependency}@{version}", "peerDependencies")
    peerDependenciesMeta_output = npm_cache(package_directory, "info", f"{dependency}@{version}", "peerDependenciesMeta")
    peerDependencies = {}
    for peer, semver_requirements in peerDependencies_output.items():
        if peerDependenciesMeta_output.get(peer, {}).get("optional", False): continue
        peerDependencies[peer] = semver_requirements
    if mute == False: console.print(f"({len(peerDependencies)})")
    return peerDependencies

# region . is_dependency_stale
def is_dependency_stale(package_directory: pathlib.PosixPath, dependency, years=1):
    time_output = npm_cache(package_directory, "info", dependency, "time")
    filtered_time = [(version, timestamp) for version, timestamp in time_output.items() if version != "modified"]
    latest_timestamp = max(timestamp for _, timestamp in filtered_time).replace("Z", "+00:00")
    then = datetime.fromisoformat(latest_timestamp)
    now = datetime.now(timezone.utc)
    is_stale = (now - then) > timedelta(days=365 * years)
    return is_stale





# region -
# region SEMVER





# region -
# region . range_intersection
def range_intersection(range1, range2):
    min1, max1 = range1
    min2, max2 = range2
    min_ = max(min1, min2)
    max_ = max2 if max1 == "inf" else max1 if max2 == "inf" else min(max1, max2)
    if max_ != "inf" and min_ >= max_: return None
    return min_, max_

# region . check_version_compatibility
def check_version_compatibility(semver_version, semver_requirements):

    def _semver_to_tuple(semver):
        if semver == "": return None
        semver = re.sub(r"[-+].*$", "", semver).replace("*", "x")
        match = re.match(r"^(\^|~|>=|<=|>|<|=)", semver)
        symbol, version = (match.group(), semver[match.end():]) if match else ("=", semver)
        parts = version.split(".")
        parts += ["x"] * (3 - len(parts))
        parts = [int(p) if p.isdigit() else None for p in parts]
        return symbol, parts

    def _get_range(semver):
        def _semver_range(semver):
            symbol, parts = _semver_to_tuple(semver) if type(semver) is str else semver
            major, minor, patch = parts
            if major is None: return [0, 0, 0], [None, None, None]
            if symbol == "^":
                if major > 0: return parts, [major + 1, 0, 0]
                if minor > 0: return parts, [0, 1 + (minor or 0), 0]
                return parts, [0, 0, patch + 1]
            if symbol == "<": return [0, 0, 0], parts
            if symbol == "~": return parts, [major, 1 + (minor or 0), 0]
            if symbol == ">=": return parts, [None, None, None]
            def _increment_version(parts):
                major, minor, patch = parts
                if patch is not None: return [major, minor, patch + 1]
                if minor is not None: return [major, minor + 1, 0]
                return [major + 1, 0, 0]
            if symbol == "<=": return [0, 0, 0], _increment_version(parts)
            if symbol == "=": return parts, _increment_version(parts)
            if symbol == ">": return _increment_version(parts), [None, None, None]
        min_, max_ = _semver_range(semver)
        def _nones_to_zeros(parts): return [0 if p is None else p for p in parts]
        def _nones_to_inf(parts): return "inf" if all(p is None for p in parts) else parts
        return _nones_to_zeros(min_), _nones_to_inf(max_)

    def _is_version_in_range(version_parts, range_):
        min_, max_ = range_
        if version_parts < min_: return False
        if max_ != "inf" and version_parts >= max_: return False
        return True

    _, version_parts = _semver_to_tuple(semver_version)
    greater_than = True
    for semver_requirement in semver_requirements.split(" || "):
        semver_tuples = [_semver_to_tuple(semver) for semver in (semver_requirement.strip() + " ").split(" ")[:2]]
        ranges = [_get_range(semver_tuple) for semver_tuple in semver_tuples if semver_tuple is not None]
        range_ = range_intersection(ranges[0], ranges[1]) if len(ranges) == 2 else ranges[0]
        if _is_version_in_range(version_parts, range_): return True, None
        if version_parts <= range_[0]: greater_than = False
    return False, greater_than




# region -
# region PACKAGE UPDATE LOGIC





# region -
# region . add_recursive_dependency_to_package
def add_recursive_dependency_to_package(
    package_directory,
    package, dependency, required_by="<root>",
    include_stale_dependencies=[],
    latest_version_restrictions={}
):
    if dependency in package:
        if required_by not in package[dependency]["required_by"]:
            package[dependency]["required_by"].append(required_by)
    else:
        versions = get_versions(package_directory, dependency)

        if dependency in latest_version_restrictions:
            requested_version = latest_version_restrictions[dependency]
            if requested_version in versions:
                latest_version = requested_version
                console.print(f"restricted version ({requested_version})", end=" ")
            else:
                fallback_version = None
                for version in versions:
                    if parse(version) < parse(requested_version):
                        fallback_version = version
                        break
                if fallback_version:
                    latest_version = fallback_version
                    console.print(f"restricted version {requested_version} not found, using fallback version ({fallback_version})", end=" ")
                else:
                    latest_version = versions[0]
                    console.print(f"restricted version {requested_version} not found, using latest version ({latest_version})", end=" ")
        else:
            latest_version = get_latest_version(package_directory, dependency)

        peerDependencies = get_peerDependencies(package_directory, dependency, latest_version)
        stale = False if dependency in include_stale_dependencies else is_dependency_stale(package_directory, dependency)
        package[dependency] = {
            "versions": versions,
            "version": latest_version,
            "peerDependencies": peerDependencies,
            "required_by": [required_by],
            "stale": stale,
        }
        for peer in peerDependencies:
            package = add_recursive_dependency_to_package(
                package_directory,
                package, peer, required_by=dependency,
                include_stale_dependencies=include_stale_dependencies,
                latest_version_restrictions=latest_version_restrictions
            )
    return package

# region . check_package_problems
def check_package_problems(package):
    problems = {
        "greater_than": {},
        "else": {},
    }
    stop = False
    for dependency, dependency_info in package.items():
        if dependency_info["stale"]: continue
        dependency_version = dependency_info["version"]
        required_by = dependency_info["required_by"]
        for peer in required_by:
            if peer == "<root>": continue
            if package[peer]["stale"]: continue
            dependency_requirements = package[peer]["peerDependencies"][dependency]
            compatible, greater_than = check_version_compatibility(dependency_version, dependency_requirements)
            if compatible: continue
            stop = True
            problems["greater_than" if greater_than else "else"][peer] = dependency_requirements
        if stop: return dependency, dependency_version, problems
    return None

# region . resolve_package_problems
def resolve_package_problems(package_directory, package, package_problems, include_stale_dependencies=[]):

    def _update_dependency_version(package_directory, package, dependency, version, peerDependencies=None, include_stale_dependencies=[]):
        previous_peerDependencies = package[dependency]["peerDependencies"]
        new_peerDependencies = peerDependencies or get_peerDependencies(package_directory, dependency, version, mute=True)
        package[dependency]["version"] = version
        package[dependency]["peerDependencies"] = new_peerDependencies
        stale = False if dependency in include_stale_dependencies else is_dependency_stale(package_directory, dependency)
        package[dependency]["stale"] = stale
        for p in previous_peerDependencies:
            if p not in new_peerDependencies:
                if dependency in package[p]["required_by"]:
                    package[p]["required_by"].remove(dependency)
        for p in new_peerDependencies:
            if p not in previous_peerDependencies:
                if dependency not in package[p]["required_by"]:
                    package[p]["required_by"].append(dependency)
        return package

    dependency, dependency_version, problems = package_problems

    # downgrade dependency to meet dependency_requirements
    if len(problems["greater_than"]) > 0:
        satisfied_peers = None
        for peer, dependency_requirements in problems["greater_than"].items():
            peers = []
            for version in package[dependency]["versions"]:
                if version > dependency_version: continue
                if check_version_compatibility(version, dependency_requirements)[1]:
                    if peer not in peers: peers.append(peer)
                    continue
                break
            package = _update_dependency_version(package_directory, package, dependency, version, peerDependencies=None, include_stale_dependencies=include_stale_dependencies)
            if len(peers) > 0:
                satisfied_peers = peers
        console.print(f"\ndowngraded {dependency}: {dependency_version} --> {version}")
        for peer in satisfied_peers:
            console.print(f"-- satisfied {peer}@{package[peer]["version"]} peerDependency: {dependency}@{problems["greater_than"][peer]}")

    def _find_compatible_version(package_directory, peer, dependency, dependency_version, package):
        versions = package[peer]["versions"]
        lo, hi = 0, len(versions) - 1
        result = None
        while lo <= hi:
            mid = (lo + hi) // 2
            version = versions[mid]
            temp_peerDependencies = get_peerDependencies(package_directory, peer, version, mute=True)
            dependency_requirements = temp_peerDependencies.get(dependency)
            if dependency_requirements is None:
                hi = mid - 1
                continue
            compatible, greater_than = check_version_compatibility(dependency_version, dependency_requirements)
            if compatible:
                result = version
                hi = mid - 1
            else:
                if greater_than: hi = mid - 1
                else: lo = mid + 1
        return result

    # downgrade peer to meet current dependency version
    dependency_version = package[dependency]["version"]
    for peer, _ in problems["else"].items():
        peer_version = package[peer]["version"]
        peer_requirements = package[peer]["peerDependencies"][dependency]
        version = _find_compatible_version(package_directory, peer, dependency, dependency_version, package)
        if version:
            console.print(f"\ndowngraded {peer}: {peer_version} --> {version}")
            temp_peerDependencies = get_peerDependencies(package_directory, peer, version, mute=True)
            package = _update_dependency_version(package_directory, package, peer, version, peerDependencies=temp_peerDependencies, include_stale_dependencies=include_stale_dependencies)
            console.print(f"-- satisfies {peer}@{version} new peerDependency for {dependency}@{dependency_version}: {dependency}@{package[peer]["peerDependencies"][dependency]} (previous peerDependency: {dependency}@{peer_requirements})")

    return package

# region -
# region MAIN





# region -
def main():
    console.clear()
    package_directory = select_package()
    console.print(f"[bold blue]Working in:[/bold blue] {package_directory}")
    backup_package(package_directory)

    include_stale_dependencies = []
    package = {}
    latest_version_restrictions = get_latest_version_restrictions(package_directory)
    console.print("finding package dependency versions and peerDependencies...")

    for dependency in get_dependencies_list(package_directory):
        package = add_recursive_dependency_to_package(
            package_directory,
            package, dependency, required_by="<root>",
            include_stale_dependencies=include_stale_dependencies,
            latest_version_restrictions=latest_version_restrictions)

    while package_problems := check_package_problems(package):
        package = resolve_package_problems(
            package_directory,
            package, package_problems,
            include_stale_dependencies=include_stale_dependencies)

    write_package_peerDependencies(package_directory, package)
    write_package_versions(package_directory, package)
    print_added_peerDependencies(package_directory, package)
    print_stale_dependencies(package)
    overwrite_package(package_directory)

if __name__ == "__main__":
    try:
        main()
    except typer.Exit:
        pass
