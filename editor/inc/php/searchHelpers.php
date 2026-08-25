<?php

	/**
	 * Build a contains-pattern for a literal SQL LIKE search.
	 *
	 * Queries using this pattern must add: ESCAPE '='
	 */
	function oasysLikeContainsPattern(string $searchTerm): string
	{
		return '%' . str_replace(['=', '%', '_'], ['==', '=%', '=_'], $searchTerm) . '%';
	}
