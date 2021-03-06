const CleanCSS = require( "clean-css" );
const deepmerge = require( "deepmerge" );
const fs = require( "fs" );
const path = require( "path" );

class Plugin
{
	static defaults = {
		categorySortOrder: [],

		dir: {
			components: "components",
			output: "/css",
		},

		fileExtensions: [".css"],
	};

	/**
	 * @param {Object} options
	 * @param {string[]} [options.categorySortOrder]
	 * @param {Object} [options.dir]
	 * @param {string} [options.dir.components] - Path to components directory, relative to Eleventy includes directory
	 * @param {string} [options.dir.output] - Path CSS output folder, relative to Eleventy output directory
	 * @param {Array} [options.fileExtensions]
	 */
	constructor( { categorySortOrder=[], dir={}, fileExtensions=[] } = {} )
	{
		this.categorySortOrder = deepmerge(
			Plugin.defaults.categorySortOrder,
			categorySortOrder,
		);

		this.dir = deepmerge(
			Plugin.defaults.dir,
			dir,
		);

		this.fileExtensions = deepmerge(
			Plugin.defaults.fileExtensions,
			fileExtensions,
		);

		this.styles = {
			async: {},
			critical: {},
		};

		this.stylesheets = {
			async: {},
			critical: {},
		};

		this.scripts = {
			async: {},
			critical: {},
		};
	}

	/**
	 * @param {Object} options
	 * @param {string} options.identifier
	 * @param {string} options.scope
	 * @param {string} options.script
	 */
	addScript( {identifier, scope, script} = {} )
	{
		if( !this.scripts[scope] )
		{
			throw new Error( `Unsupported scope: '${scope}'` );
		}

		if( !this.scripts[scope][identifier] )
		{
			this.scripts[scope][identifier] = [];
		}

		if( this.scripts[scope][identifier].indexOf( script ) === -1 )
		{
			this.scripts[scope][identifier].push( script );
		}
	}

	/**
	 * @param {Object} options
	 * @param {string} options.identifier
	 * @param {string} options.style
	 * @param {string} options.scope
	 */
	addStyle( {identifier, scope, style} = {} )
	{
		if( !this.styles[scope] )
		{
			throw new Error( `Unsupported scope: '${scope}'` );
		}

		if( !this.styles[scope][identifier] )
		{
			this.styles[scope][identifier] = [];
		}

		// Don't add duplicate styles
		if( this.styles[scope][identifier].indexOf( style ) === -1 )
		{
			this.styles[scope][identifier].push( style );
		}
	}

	/**
	 * @param {Object} options
	 * @param {string} [options.category]
	 * @param {string} options.scope
	 * @param {string} options.stylesheet
	 */
	addStylesheet( {category="uncategorized", scope, stylesheet} = {} )
	{
		if( !this.styles[scope] )
		{
			throw new Error( `Unsupported scope: '${scope}'` );
		}

		if( !this.stylesheets[scope][category] )
		{
			this.stylesheets[scope][category] = [];
		}

		this.stylesheets[scope][category].push( stylesheet );
	}

	/**
	 * @param {string} directoryPath
	 */
	addStylesheetsDirectory( directoryPath )
	{
		let directoryStylesheets = getStylesheetsFromDirectory({
			directoryPath: directoryPath,
			fileExtensions: this.fileExtensions,

		});
		this.stylesheets = deepmerge( this.stylesheets, directoryStylesheets );
	}

	/**
	 * Return all async styles associated with the requested identifier
	 *
	 * @param {Object} options
	 * @param {string} [options.identifier]
	 * @param {string} [options.category]
	 * @returns {string}
	 */
	asyncStyles( {identifier, category} = {} )
	{
		return this.getStyles({
			category: category,
			scope: "async",
			identifier: identifier,
		});
	}

	/**
	 * Return all critical styles associated with the requested identifier
	 *
	 * @param {Object} options
	 * @param {string} [options.identifier]
	 * @param {string} [options.category]
	 * @returns {string}
	 */
	criticalStyles( {identifier, category} = {} )
	{
		return this.getStyles({
			category: category,
			scope: "critical",
			identifier: identifier,
		});
	}

	/**
	 * Return all async scripts associated with the requested identifier
	 *
	 * @param {Object} options
	 * @param {string} [options.identifier]
	 * @returns {string}
	 */
	asyncScripts( {identifier} = {} )
	{
		let scripts = this.scripts["async"][identifier];
		if( !scripts )
		{
			return "";
		}

		let scriptTags = scripts
			.map( script =>
			{
				if( script.src )
				{
					let attributes = Object.keys( script )
						.map( key =>
						{
							if( script[key] === true )
							{
								return key;
							}
							else
							{
								return `${key}="${script[key]}"`;
							}
						});

					return `<script ${attributes.join( " " )}></script>`;
				}
				else
				{
					return `<script src="${script}"></script>`;
				}
			});

	return scriptTags
		.filter( (value, index) => scriptTags.indexOf( value ) === index )
		.join( "\n" );
	}

	/**
	 * Return all critical scripts associated with the requested identifier
	 *
	 * @param {Object} options
	 * @param {string} [options.identifier]
	 * @returns {string}
	 */
	criticalScripts( {identifier} = {} )
	{
		let scripts = this.scripts["critical"][identifier];
		if( !scripts )
		{
			return "";
		}

		return scripts
			.filter( (value, index) => scripts.indexOf( value ) === index )
			.join( "\n" );
	}

	/**
	 * @param {Object} options
	 * @param {string} options.category
	 * @param {string} options.identifier
	 * @param {string} options.scope
	 */
	getStyles( {category, identifier, scope} )
	{
		let allStyles = [];

		/* Stylesheets */
		let stylesheets = [];
		if( category )
		{
			stylesheets = this.stylesheets[scope][category];
		}
		else
		{
			Object.keys( this.stylesheets[scope] )
				.sort( (a,b) =>
				{
					let sortIndexA = this.categorySortOrder.indexOf(a) > -1
						? this.categorySortOrder.indexOf(a) - this.categorySortOrder.length
						: 0

					let sortIndexB = this.categorySortOrder.indexOf(b) > -1
						? this.categorySortOrder.indexOf(b) - this.categorySortOrder.length
						: 0

					return sortIndexA - sortIndexB;
				})
				.forEach( category =>
				{
					stylesheets = stylesheets.concat(
						this.stylesheets[scope][category]
					);
				});
		}

		stylesheets.forEach( stylesheet =>
		{
			let style = fs.readFileSync( stylesheet );
			allStyles.push( style.toString() );
		});

		/* Styles */
		if( this.styles[scope][identifier] )
		{
			let styles = this.styles[scope][identifier];

			let uniqueStyles = styles
				.filter( (value, index) => styles.indexOf( value ) === index );

			allStyles = allStyles.concat( uniqueStyles );
		}

		return this.stylePostProcessor(
			allStyles.join( "\n" )
		);
	}

	/**
	 * @param {string} identifier
	 * @returns {boolean}
	 */
	hasAsyncStyles( identifier )
	{
		return this.hasStyleScope({
			identifier: identifier,
			scope: "async",
		});
	}

	/**
	 * @param {string} identifier
	 * @returns {boolean}
	 */
	hasCriticalStyles( identifier )
	{
		return this.hasStyleScope({
			identifier: identifier,
			scope: "critical",
		});
	}

	/**
	 * @param {string} identifier
	 * @returns {boolean}
	 */
	hasAsyncScripts( identifier )
	{
		if( !this.scripts["async"][identifier] )
		{
			return false;
		}

		return this.scripts["async"] &&
			this.scripts["async"][identifier] &&
			this.scripts["async"][identifier].length > 0;
	}

	/**
	 * @param {string} identifier
	 * @returns {boolean}
	 */
	hasCriticalScripts( identifier )
	{
		if( !this.scripts["critical"][identifier] )
		{
			return false;
		}

		return this.scripts["critical"] &&
			this.scripts["critical"][identifier] &&
			this.scripts["critical"][identifier].length > 0;
	}

	/**
	 * @param {Object} options
	 * @param {string} options.scope
	 * @param {string} options.identifier
	 * @returns {boolean}
	 */
	hasStyleScope( { scope, identifier } = {} )
	{
		let hasScope = false;

		Object.keys( this.stylesheets[scope] ).forEach( category =>
		{
			hasScope = hasScope || this.stylesheets[scope][category].length > 0;
		});

		if( identifier )
		{
			hasScope = hasScope ||
				(this.styles[scope][identifier] && this.styles[scope][identifier].length > 0)
		}

		return hasScope;
	}

	/**
	 * @param {string} style
	 * @returns {string}
	 */
	stylePostProcessor( style )
	{
		let options = {
			level: {
				2: {
					all: true,
				},
			},
		};

		if( process.env.NODE_ENV !== "production" )
		{
			options = {
				format: "beautify",
			};
		}

		return new CleanCSS( options )
			.minify( style )
			.styles;
	}
}

module.exports = Plugin;

/**
 * @param {Object} options
 * @param {string} options.directoryPath
 * @param {string[]} options.fileExtensions
 * @param {string} [options.category]
 * @returns {Object}
 */
function getStylesheetsFromDirectory( { directoryPath, fileExtensions, category } )
{
	let stylesheets = {
		async: {},
		critical: {},
	};

	let directoryContents = fs.readdirSync
	(
		directoryPath,
		{ withFileTypes: true }
	);

	directoryContents.forEach( child =>
	{
		let childPath = path.normalize( `${directoryPath}/${child.name}` );
		let childCategory = category;

		if( child.isFile() && !fileExtensions.includes( path.extname( child.name ) ) )
		{
			return;
		}

		if( childCategory === undefined )
		{
			if( child.isDirectory() )
			{
				childCategory = child.name.toLowerCase()
			}
			else
			{
				childCategory = path.basename(
					child.name,
					path.extname( child.name )
				);
			}
		}

		if( !stylesheets.async[childCategory] )
		{
			stylesheets.async[childCategory] = []
		}
		if( !stylesheets.critical[childCategory] )
		{
			stylesheets.critical[childCategory] = []
		}

		if( child.isDirectory() )
		{
			let categoryStylesheets = getStylesheetsFromDirectory({
				directoryPath: childPath,
				fileExtensions: fileExtensions,
				category: childCategory,
			});

			stylesheets.async[childCategory] = stylesheets.async[childCategory].concat(
				categoryStylesheets.async[childCategory]
			);

			stylesheets.critical[childCategory] = stylesheets.critical[childCategory].concat(
				categoryStylesheets.critical[childCategory]
			);
		}
		else
		{
			let scope = path
				.basename( child.name )
				.includes( "-critical" )
				? "critical"
				: "async";

			stylesheets[scope][childCategory].push( childPath );
		}
	});

	return stylesheets;
}
